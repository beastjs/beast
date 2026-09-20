# Changelog policy

`beast-tsrx`, `create-beast`, and the skills mirror the supported Octane release
number (currently `0.3.2`). The language server retains its own version. Record a user-visible change
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
4. Release `beast-tsrx` before packages that depend on its new version, then
   release the language server, `create-beast`, and skill as applicable.
5. Run `bun install --frozen-lockfile`, `bun run check`, and `bun run pack:check`
   before publishing or tagging.

Do not move an entry out of `Unreleased` or describe a version as released until
the matching artifact is ready to publish.
