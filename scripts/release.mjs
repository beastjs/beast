import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const directory = '.release';
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

export function changelogEntry(source, version) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line.startsWith(`## [${version}] - `));
  if (start === -1) throw new Error(`Missing dated changelog entry for ${version}.`);
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start + 1, next === -1 ? undefined : next).join('\n').trim();
}

async function prepare() {
  const manifests = await Promise.all([...packages.map(pkg => json(pkg.manifest)), json('skills/beast/package.json')]);
  const version = releaseVersion(manifests);
  await mkdir(directory, { recursive: true });
  const artifacts = packages.map(pkg => {
    // Checks already built these files; attach those exact tarballs for manual npm publishing.
    const output = run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination',
      pkg.cwd === '.' ? directory : `../../${directory}`], { cwd: pkg.cwd });
    return packedArtifact(output, pkg.name, version);
  });
  const skills = `beast-skills-${version}.tgz`;
  const skillFiles = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'skills']);
  run('tar', ['-czf', `${directory}/${skills}`, '--null', '-T', '-'], { input: skillFiles });
  await writeFile(`${directory}/release.json`, JSON.stringify({ version, packages: artifacts, skills }, null, 2) + '\n');
  await writeFile(`${directory}/notes.md`, [
    `Coordinated Beast ${version} release, aligned with Octane ${version}.`, '',
    'The attached npm tarballs are ready for manual publishing. The workflow does not publish to npm.', '',
    '```sh',
    `npm publish ./beast-tsrx-${version}.tgz --access public`,
    `npm publish ./create-beast-${version}.tgz --access public`,
    '```', '',
    `- \`${skills}\` contains the Beast and React-to-Beast agent skills under \`skills/\`.`, '',
    '## beast-tsrx', '', changelogEntry(await readFile('CHANGELOG.md', 'utf8'), version), '',
    '## create-beast', '', changelogEntry(await readFile('packages/create-beast/CHANGELOG.md', 'utf8'), version), '',
    '## Skills', '', changelogEntry(await readFile('skills/beast/CHANGELOG.md', 'utf8'), version), '',
  ].join('\n'));
}

export function createGitHubRelease(release, sha, execute = run) {
  validateArtifacts(release, release.version);
  const assets = [...release.packages.map(pkg => pkg.file), release.skills];
  const tag = release.version;
  // List tags instead of interpreting every gh release view failure as a missing release.
  const tags = JSON.parse(execute('gh', ['api', '--paginate', '--slurp', 'repos/beastjs/beast/releases?per_page=100'])).flat();
  const existing = tags.find(item => item.tag_name === tag);
  if (existing) {
    const missing = assets.filter(file => !existing.assets.some(asset => asset.name === file));
    if (missing.length) {
      execute('gh', ['release', 'upload', tag, ...missing.map(file => `${directory}/${file}`)], { stdio: 'inherit' });
    } else console.log(`Skipping already-released Beast ${tag}.`);
  } else {
    execute('gh', ['release', 'create', tag, ...assets.map(file => `${directory}/${file}`),
      '--target', sha, '--title', `Beast ${tag}`,
      '--notes-file', `${directory}/notes.md`], { stdio: 'inherit' });
  }
}

async function release() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== 'beastjs/beast'
    || process.env.GITHUB_REF !== 'refs/heads/main' || !['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)) {
    throw new Error('GitHub releases are only supported by the main-branch GitHub Actions release job.');
  }
  const release = await json(`${directory}/release.json`);
  const version = releaseVersion(await Promise.all([...packages.map(pkg => json(pkg.manifest)), json('skills/beast/package.json')]));
  validateArtifacts(release, version);
  createGitHubRelease(release, process.env.GITHUB_SHA);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'prepare') await prepare();
  else if (process.argv[2] === 'release') await release();
  else throw new Error('Usage: node scripts/release.mjs prepare|release');
}
