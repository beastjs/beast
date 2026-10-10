import { describe, expect, test } from 'bun:test';
// @ts-expect-error Release automation runs directly in Node without a compilation step.
import { changelogEntry, createGitHubRelease, packedArtifact, releaseVersion, validateArtifacts } from '../scripts/release.mjs';
// @ts-expect-error Release automation runs directly in Node without a compilation step.
import { checkReadiness } from '../scripts/wait-for-checks.mjs';

describe('release safeguards', () => {
  const check = (name: string, status = 'completed', conclusion: string | null = 'success') =>
    ({ name, status, conclusion });
  const passing = [check('Checks'), check('Analyze (javascript-typescript)')];

  test('requires aligned stable versions', () => {
    expect(releaseVersion([{ version: '0.7.1' }, { version: '0.7.1' }, { version: '0.7.1' }])).toBe('0.7.1');
    expect(() => releaseVersion([{ version: '0.7.1' }, { version: '0.7.2' }])).toThrow();
    expect(() => releaseVersion([{ version: '0.8.0-beta.1' }])).toThrow();
  });

  test('waits for CodeQL and every other pending check or status', () => {
    expect(checkReadiness([passing[0]], [], '123').ready).toBe(false);
    expect(checkReadiness([...passing, check('External', 'in_progress', null)], [], '123').ready).toBe(false);
    expect(checkReadiness(passing, [{ context: 'External', state: 'pending' }], '123').ready).toBe(false);
    expect(checkReadiness(passing, [], '123').ready).toBe(true);
  });

  test('blocks failed, cancelled, and skipped checks and failed statuses', () => {
    for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out']) {
      expect(checkReadiness([...passing, check('External', 'completed', conclusion)], [], '123').failed).toHaveLength(1);
    }
    expect(checkReadiness(passing, [{ context: 'External', state: 'failure' }], '123').ready).toBe(false);
  });

  test('rejects mismatched versions, package order, and artifact paths before publishing', () => {
    const artifacts = { version: '0.7.1', skills: 'beast-skills-0.7.1.tgz', packages: [
      { name: 'beast-tsrx', file: 'beast-tsrx-0.7.1.tgz' },
      { name: 'create-beast', file: 'create-beast-0.7.1.tgz' },
    ] };
    expect(() => validateArtifacts(artifacts, '0.7.1')).not.toThrow();
    expect(() => validateArtifacts(artifacts, '0.7.2')).toThrow();
    expect(() => validateArtifacts({ ...artifacts, packages: artifacts.packages.toReversed() }, '0.7.1')).toThrow();
    expect(() => validateArtifacts({ ...artifacts, skills: '../other.tgz' }, '0.7.1')).toThrow();
  });

  test('reads npm 11 and npm 12 pack output and rejects an unexpected package', () => {
    const packed = { name: 'beast-tsrx', version: '0.7.1', filename: 'beast-tsrx-0.7.1.tgz' };
    for (const output of [[packed], { 'beast-tsrx': packed }]) {
      expect(packedArtifact(JSON.stringify(output), 'beast-tsrx', '0.7.1')).toEqual({
        name: 'beast-tsrx', file: 'beast-tsrx-0.7.1.tgz',
      });
    }
    expect(() => packedArtifact(JSON.stringify([packed]), 'create-beast', '0.7.1')).toThrow();
    expect(() => packedArtifact(JSON.stringify([packed]), 'beast-tsrx', '0.7.2')).toThrow();
  });

  test('ignores only the release job from this workflow run', () => {
    const own = { ...check('Release', 'in_progress', null), details_url: 'https://github.com/beastjs/beast/actions/runs/123/job/456' };
    expect(checkReadiness([...passing, own], [], '123').ready).toBe(true);
    expect(checkReadiness([...passing, own], [], '999').ready).toBe(false);
  });

  test('creates a GitHub release with both npm archives and skills, without publishing to npm', () => {
    const artifacts = { version: '0.12.1', skills: 'beast-skills-0.12.1.tgz', packages: [
      { name: 'beast-tsrx', file: 'beast-tsrx-0.12.1.tgz' },
      { name: 'create-beast', file: 'create-beast-0.12.1.tgz' },
    ] };
    const calls: Array<{ command: string; args: string[] }> = [];
    const execute = (command: string, args: string[]) => {
      calls.push({ command, args });
      return '[]';
    };
    createGitHubRelease(artifacts, 'abc123', execute);
    expect(calls).toEqual([
      { command: 'gh', args: ['api', '--paginate', '--slurp', 'repos/beastjs/beast/releases?per_page=100'] },
      { command: 'gh', args: ['release', 'create', '0.12.1', '.release/beast-tsrx-0.12.1.tgz',
        '.release/create-beast-0.12.1.tgz', '.release/beast-skills-0.12.1.tgz',
        '--target', 'abc123', '--title', 'Beast 0.12.1', '--notes-file', '.release/notes.md'] },
    ]);

    calls.length = 0;
    createGitHubRelease(artifacts, 'abc123', (command: string, args: string[]) => {
      calls.push({ command, args });
      return JSON.stringify([[{ tag_name: '0.12.1', assets: [{ name: artifacts.skills }] }]]);
    });
    expect(calls[1]).toEqual({ command: 'gh', args: ['release', 'upload', '0.12.1',
      '.release/beast-tsrx-0.12.1.tgz', '.release/create-beast-0.12.1.tgz'] });
  });

  test('release notes include only the requested dated changelog entry', () => {
    const source = '# Changelog\n\n## [Unreleased]\n\n## [0.12.1] - 2026-10-10\n\n### Added\n\n- Builder.\n\n## [0.8.0] - 2026-10-04\n\n- Older.\n';
    expect(changelogEntry(source, '0.12.1')).toBe('### Added\n\n- Builder.');
    expect(() => changelogEntry(source, '0.12.0')).toThrow();
  });
});
