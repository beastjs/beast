import { describe, expect, test } from 'bun:test';
// @ts-expect-error Release automation runs directly in Node without a compilation step.
import { isPublished, packedArtifact, releaseVersion, validateArtifacts } from '../scripts/release.mjs';
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

  test('skips existing npm versions but fails closed on registry errors', async () => {
    expect(await isPublished('beast-tsrx', '0.7.1', async () => new Response('{}', { status: 200 }))).toBe(true);
    expect(await isPublished('beast-tsrx', '0.7.2', async () => new Response('{}', { status: 404 }))).toBe(false);
    for (const status of [401, 403, 429, 500]) {
      await expect(isPublished('beast-tsrx', '0.7.2', async () => new Response('{}', { status }))).rejects.toThrow();
    }
  });
});
