import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Keep the expected CodeQL name in sync with GitHub's default setup.
export function checkReadiness(checks, statuses, runId) {
  const others = checks.filter(check => !(check.name === 'Release'
    && check.details_url?.includes(`/actions/runs/${runId}/`)));
  const missing = ['Checks', 'Analyze (javascript-typescript)']
    .filter(name => !others.some(check => check.name === name));
  const failed = others.filter(check => check.status === 'completed' && check.conclusion !== 'success')
    .map(check => `${check.name}: ${check.conclusion}`);
  failed.push(...statuses.filter(status => ['failure', 'error'].includes(status.state))
    .map(status => `${status.context}: ${status.state}`));
  const pending = [...missing, ...others.filter(check => check.status !== 'completed').map(check => check.name),
    ...statuses.filter(status => status.state === 'pending').map(status => status.context)];
  return { ready: failed.length === 0 && pending.length === 0, failed, pending };
}

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub API ${path}: HTTP ${response.status}`);
  return response.json();
}

async function pages(path, key) {
  const result = [];
  for (let page = 1; ; page++) {
    const data = await github(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const entries = key ? data[key] : data;
    result.push(...entries);
    if (entries.length < 100) return result;
  }
}

async function main() {
  const sha = process.env.GITHUB_SHA;
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const [branch, checks, statuses] = await Promise.all([
      github('branches/main'), pages(`commits/${sha}/check-runs?filter=latest`, 'check_runs'),
      pages(`commits/${sha}/statuses`),
    ]);
    if (branch.commit.sha !== sha) {
      console.log('A newer commit is on main; its workflow will handle the release.');
      await appendFile(process.env.GITHUB_OUTPUT, 'ready=false\n');
      return;
    }
    // The statuses endpoint returns newest first; superseded statuses must not block retries.
    const latest = [...new Map(statuses.toReversed().map(status => [status.context, status])).values()];
    const result = checkReadiness(checks, latest, process.env.GITHUB_RUN_ID);
    if (result.failed.length) throw new Error(`Release blocked by failed checks: ${result.failed.join(', ')}`);
    if (result.ready) {
      await appendFile(process.env.GITHUB_OUTPUT, 'ready=true\n');
      return;
    }
    console.log(`Waiting for: ${result.pending.join(', ')}`);
    await new Promise(resolve => setTimeout(resolve, 15_000));
  }
  throw new Error('Timed out waiting for all commit checks to pass.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
