import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const directory = '.release';
const registry = 'https://registry.npmjs.org';
const packages = [
  { name: 'beast-tsrx', manifest: 'package.json', cwd: '.' },
  { name: 'create-beast', manifest: 'packages/create-beast/package.json', cwd: 'packages/create-beast' },
];
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', ...options });
const json = async path => JSON.parse(await readFile(path, 'utf8'));

export function releaseVersion(manifests) {
  const version = manifests[0].version;
  if (!/^\d+\.\d+\.\d+$/.test(version) || manifests.some(manifest => manifest.version !== version)) {
    throw new Error('beast-tsrx, create-beast, and the Beast skill must share a stable release version.');
  }
  return version;
}

export async function isPublished(name, version, fetcher = fetch) {
  const response = await fetcher(`${registry}/${encodeURIComponent(name)}/${version}`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Cannot check ${name}@${version}: registry HTTP ${response.status}`);
  return true;
}

export function validateArtifacts(release, version) {
  if (release.version !== version || release.skills !== `beast-skills-${version}.tgz`
    || release.packages.length !== packages.length
    || packages.some((pkg, index) => release.packages[index].name !== pkg.name
      || release.packages[index].file !== `${pkg.name}-${version}.tgz`)) {
    throw new Error('Release artifacts do not match the checked-out packages and version.');
  }
}

export function packedArtifact(output, name, version) {
  const result = JSON.parse(output);
  // npm 11 emits an array; npm 12 can emit an object keyed by workspace name.
  const packed = Array.isArray(result) ? result[0] : result[name];
  if (packed?.name !== name || packed.version !== version || packed.filename !== `${name}-${version}.tgz`) {
    throw new Error(`Unexpected npm pack result for ${name}@${version}.`);
  }
  return { name, file: packed.filename };
}

async function prepare() {
  const manifests = await Promise.all([...packages.map(pkg => json(pkg.manifest)), json('skills/beast/package.json')]);
  const version = releaseVersion(manifests);
  await mkdir(directory, { recursive: true });
  const artifacts = packages.map(pkg => {
    // check already built these files; publish exactly the tarballs prepared by that job.
    const output = run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination',
      pkg.cwd === '.' ? directory : `../../${directory}`], { cwd: pkg.cwd });
    return packedArtifact(output, pkg.name, version);
  });
  const skills = `beast-skills-${version}.tgz`;
  const skillFiles = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'skills']);
  run('tar', ['-czf', `${directory}/${skills}`, '--null', '-T', '-'], { input: skillFiles });
  await writeFile(`${directory}/release.json`, JSON.stringify({ version, packages: artifacts, skills }, null, 2) + '\n');
  await writeFile(`${directory}/notes.md`, [
    `Coordinated Beast ${version} release.`, '',
    `- npm: \`beast-tsrx@${version}\` and \`create-beast@${version}\`.`,
    `- \`${skills}\` contains the Beast and React-to-Beast agent skills under \`skills/\`.`, '',
    'See CHANGELOG.md, packages/create-beast/CHANGELOG.md, and skills/beast/CHANGELOG.md at this tag for release notes.', '',
  ].join('\n'));
}

async function publish() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== 'beastjs/beast'
    || process.env.GITHUB_REF !== 'refs/heads/main' || !['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)) {
    throw new Error('Publishing is only supported by the main-branch GitHub Actions release job.');
  }
  const release = await json(`${directory}/release.json`);
  const version = releaseVersion(await Promise.all([...packages.map(pkg => json(pkg.manifest)), json('skills/beast/package.json')]));
  validateArtifacts(release, version);
  // Preflight both packages so a registry outage fails before any publishing starts.
  const published = await Promise.all(packages.map(pkg => isPublished(pkg.name, version)));
  for (const [index, pkg] of release.packages.entries()) {
    if (published[index]) {
      console.log(`Skipping already-published ${pkg.name}@${version}.`);
    } else {
      run('npm', ['publish', `${directory}/${pkg.file}`, '--ignore-scripts', '--access', 'public', '--provenance', '--registry', registry], { stdio: 'inherit' });
    }
  }
  const tag = version;
  // List tags instead of interpreting every gh release view failure as a missing release.
  const tags = JSON.parse(run('gh', ['api', '--paginate', '--slurp', 'repos/beastjs/beast/releases?per_page=100'])).flat();
  const existing = tags.find(release => release.tag_name === tag);
  if (existing) {
    // Existing coordinated releases may predate the skills archive; complete them on retry.
    if (!existing.assets.some(asset => asset.name === release.skills)) {
      run('gh', ['release', 'upload', tag, `${directory}/${release.skills}`], { stdio: 'inherit' });
    } else console.log(`Skipping already-released ${release.skills}.`);
  } else {
    run('gh', ['release', 'create', tag, `${directory}/${release.skills}`,
      '--target', process.env.GITHUB_SHA, '--title', `Beast ${version}`,
      '--notes-file', `${directory}/notes.md`], { stdio: 'inherit' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'prepare') await prepare();
  else if (process.argv[2] === 'publish') await publish();
  else throw new Error('Usage: node scripts/release.mjs prepare|publish');
}
