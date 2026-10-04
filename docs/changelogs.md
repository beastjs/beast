# Changelog policy

`beast-tsrx`, `create-beast`, and the skills mirror the supported Octane release
number (currently `0.8.0`). The language server retains its own version. Record a user-visible change
in every affected component's changelog:

| Deliverable | Changelog |
| --- | --- |
| `beast-tsrx` compiler and bundler adapters | [`../CHANGELOG.md`](../CHANGELOG.md) |
| `create-beast` CLI and starter templates | [`../packages/create-beast/CHANGELOG.md`](../packages/create-beast/CHANGELOG.md) |
| `beast-language-server` | [`../packages/language-server/CHANGELOG.md`](../packages/language-server/CHANGELOG.md) |
| Beast Codex skill | [`../skills/beast/CHANGELOG.md`](../skills/beast/CHANGELOG.md) |

## Writing entries

- Add changes under `Unreleased` as they land.
- Describe observable behavior rather than commits or implementation details.
- Use Keep a Changelog categories: `Added`, `Changed`, `Deprecated`, `Removed`,
  `Fixed`, and `Security`. Omit empty categories.
- Add an entry to each affected deliverable. A compiler entry does not replace
  a `create-beast`, language-server, or skill entry.
- Keep generated starter-project changelogs empty apart from their own
  `Unreleased` heading; they belong to the generated application, not Beast.

## Cutting coordinated releases

1. Verify exact Octane and companion-plugin compatibility in the root manifest,
   lockfile, starter manifests, documentation, and conformance tests.
2. Move each affected component's entries from `Unreleased` into a versioned,
   ISO-dated section and recreate an empty `Unreleased` section above it.
3. Align the compiler, project builder, and skill versions with Octane; bump other affected manifests and update badges or exact inter-package
   dependencies in the same change.
4. Merge the coordinated version change into `main`. The automated workflow
   publishes `beast-tsrx`, then `create-beast`, and attaches the skills archive
   to the matching GitHub release once all checks pass. Release the separately
   versioned language server manually as applicable.
5. Run `bun install --frozen-lockfile`, `bun run check`, and `bun run pack:check`
   before publishing or tagging.

Do not move an entry out of `Unreleased` or describe a version as released until
the matching artifact is ready to publish.

## Automated releases

`.github/workflows/release.yml` runs on pull requests, pushes to `main`, and
manual dispatches. Its Checks job installs the frozen lockfile, runs the full
typecheck/test/build suite and package dry runs, checks skill scripts, and
prepares the release tarballs. The Release job runs only on this repository's
`main` branch and publishes those exact npm tarballs after all commit checks
and statuses succeed, including GitHub's existing CodeQL
`Analyze (javascript-typescript)` check. Missing or pending checks wait for up
to 20 minutes; failed, cancelled, or skipped checks block publishing. Keep the
expected CodeQL check name in `scripts/wait-for-checks.mjs` synchronized with
the repository's CodeQL configuration.

Versions remain aligned with Octane; the workflow does not bump them. Existing
npm versions and skills assets are skipped, so unchanged versions do not
publish again, and rerunning a failed workflow completes a partial release.
A run for an older `main` commit yields to the newer commit's workflow.
The language server is checked and packed but is not automatically published.

`beast-skills-<version>.tgz` is a GitHub release asset containing both tracked
skill directories under `skills/`. The private `skills/beast/package.json`
supplies its version; it is not an npm package. Extract the archive to access
`skills/beast/` and `skills/react-to-beast/`.

### One-time npm setup

Configure a GitHub Actions trusted publisher on npm for **both** `beast-tsrx`
and `create-beast`, with these values:

| Field | Value |
| --- | --- |
| Organization or user | `beastjs` |
| Repository | `beast` |
| Workflow filename | `release.yml` |
| Environment | Leave empty |
| Allowed action | Direct publishing with `npm publish` |

The release job uses Node.js 24 and npm's OIDC authentication with
`id-token: write`, and publishes with provenance. No npm token secret is
required. See [npm's trusted publisher documentation](https://docs.npmjs.com/trusted-publishers/).
Until these package settings are configured, new npm versions cannot publish.
GitHub releases and assets use the built-in workflow token.
