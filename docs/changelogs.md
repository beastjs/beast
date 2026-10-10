# Changelog policy

`beast-tsrx`, `create-beast`, and the skills mirror the supported Octane release
number (currently `0.12.1`). The language server retains its own version. Record a user-visible change
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
4. Run `bun install --frozen-lockfile`, `bun run check`, and `bun run pack:check`
   before publishing or tagging.
5. Push the coordinated version change to `main`. Once all checks pass, the
   automated workflow creates the matching GitHub release with the checked
   compiler, builder, and skills archives. Publish the npm archives manually,
   compiler first. Release the separately versioned language server as applicable.

Do not move an entry out of `Unreleased` or describe a version as released until
the matching artifact is ready to publish.

## Automated releases

`.github/workflows/release.yml` runs on pull requests, pushes to `main`, and
manual dispatches. Its Checks job installs the frozen lockfile, runs the full
build/typecheck/test suite and package dry runs, checks skill scripts, and
prepares the release tarballs. The Release job runs only on this repository's
`main` branch and attaches those exact npm tarballs to a GitHub release after
all commit checks and statuses succeed, including GitHub's existing CodeQL
`Analyze (javascript-typescript)` check. Missing or pending checks wait for up
to 20 minutes; failed, cancelled, or skipped checks block release creation. Keep the
expected CodeQL check name in `scripts/wait-for-checks.mjs` synchronized with
the repository's CodeQL configuration.

Versions remain aligned with Octane; the workflow does not bump them or
publish to npm. Existing release assets are skipped, so rerunning a failed
workflow completes a partial GitHub release without replacing its archives.
A run for an older `main` commit yields to the newer commit's workflow.
The language server is checked and packed but is not automatically published.

Builds run before type checking and tests because the language server consumes
the compiler's public `dist/` JavaScript and declaration files. `bunfig.toml`
selects the hoisted linker so the root `link:.` override stays a live package
link instead of an isolated copy made before those files exist. Together these
settings support a fresh checkout with no existing build output.

`beast-skills-<version>.tgz` is a GitHub release asset containing both tracked
skill directories under `skills/`. The private `skills/beast/package.json`
supplies its version; it is not an npm package. Extract the archive to access
`skills/beast/` and `skills/react-to-beast/`.

### Manual npm publishing

Download the checked npm tarballs from the GitHub release and publish them in
this order from the download directory:

```bash
npm publish ./beast-tsrx-0.12.1.tgz --access public
npm publish ./create-beast-0.12.1.tgz --access public
# When releasing the separately versioned language server:
npm publish ./beast-language-server-0.2.2.tgz --access public
```

Use an npm account with publishing access. The release workflow uses only the
built-in GitHub token; npm credentials and publishing remain local to the
maintainer. Skill archives are GitHub assets, not npm packages.
