import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packedArtifact } from './release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demo = resolve(root, '.release/create-beast-demo');
const projects = resolve(demo, 'projects');
const args = process.argv.slice(2);
const prepareOnly = args.length === 1 && args[0] === '--prepare';

function run(command, arguments_, cwd = root) {
  try {
    return execFileSync(command, arguments_, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    throw new Error([`${command} ${arguments_.join(' ')} failed.`, error.stdout, error.stderr]
      .filter(Boolean).join('\n'), { cause: error });
  }
}

async function prepareDemo() {
  console.log('Preparing a local create-beast preview…');
  run('bun', ['run', 'build']);
  await mkdir(resolve(demo, 'snapshots'), { recursive: true });
  await mkdir(projects, { recursive: true });
  // Keep compiler tarballs for earlier demo projects when refreshing the CLI.
  const snapshot = await mkdtemp(resolve(demo, 'snapshots/preview-'));
  const artifacts = [];
  for (const [name, cwd] of [['beast-tsrx', root], ['create-beast', resolve(root, 'packages/create-beast')]]) {
    const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
    const output = run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', snapshot], cwd);
    artifacts.push(packedArtifact(output, name, manifest.version));
  }
  const compiler = resolve(snapshot, artifacts[0].file);
  const builder = resolve(snapshot, 'builder');
  await mkdir(builder);
  run('tar', ['-xzf', resolve(snapshot, artifacts[1].file), '-C', builder, '--strip-components=1']);
  const preview = { entry: resolve(builder, 'dist/index.js'), compilerSpec: `file:${compiler}`, projects };
  await writeFile(resolve(demo, 'preview.json'), JSON.stringify(preview, null, 2) + '\n');
  await writeFile(resolve(demo, 'run.mjs'), `import { readFile } from 'node:fs/promises';
const preview = JSON.parse(await readFile(new URL('./preview.json', import.meta.url), 'utf8'));
const { runCli } = await import((await import('node:url')).pathToFileURL(preview.entry).href);
process.chdir(preview.projects);
process.exitCode = await runCli(process.argv.slice(2), { compilerSpec: preview.compilerSpec });
`);
  await writeFile(resolve(demo, 'README.md'), [
    '# Local create-beast demo', '',
    'Run the prepared CLI from the Beast repository:', '',
    '```sh', 'bun .release/create-beast-demo/run.mjs', '```', '',
    'To rebuild the preview and run the CLI in one command:', '',
    '```sh', 'bun run demo:create', '```', '',
    'The demo uses npm-packed copies of the current builder and compiler.',
    'Generated projects use the local Beast compiler tarball; all other dependencies install normally.',
    `Projects are created in \`${projects}\`. Give each trial a different directory name.`, '',
    'Try each bundler, select the optional tools, and exercise both final-menu choices.',
    'Open and run starts the development server; Ctrl+C leaves a shell in your project.',
    'Type `exit` to return. `--yes` and `--no-install` retain the regular automation behavior.', '',
    'Pass normal CLI arguments to either command, for example:', '',
    '```sh', 'bun .release/create-beast-demo/run.mjs rsbuild-demo --bundler rsbuild --devtools --page-builder', '```', '',
  ].join('\n'));
  return preview;
}

try {
  const preview = await prepareDemo();
  if (prepareOnly) {
    console.log('Demo ready: bun .release/create-beast-demo/run.mjs');
    console.log(`Projects: ${projects}`);
  } else {
    process.chdir(projects);
    const { runCli } = await import(pathToFileURL(preview.entry).href);
    process.exitCode = await runCli(args, { compilerSpec: preview.compilerSpec });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
