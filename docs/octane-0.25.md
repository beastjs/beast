# Upgrade Beast to Octane 0.25.0

Upgrade Beast and Octane together and rebuild client and server output.
Upgrade UI and router packages to versions that accept Octane `^0.25.0`.

| Package | Version |
| --- | --- |
| `beast-tsrx`, `create-beast`, `octane` | `0.25.0` |
| `beast-language-server` | `0.2.7` |
| `@tsrx/oxc` | `0.24.0` |
| `@tsrx/typescript-plugin` | `0.7.15` |
| `@octanejs/rspack-plugin` / `@octanejs/rsbuild-plugin` | `0.3.0` / `0.2.8` |
| `@octanejs/base-ui` / `@octanejs/radix` | `0.1.79` / `0.1.79` |
| `@octanejs/shadcn` | `0.0.69` |
| `@octanejs/remix-router` / `@octanejs/tanstack-router` | `0.1.74` / `0.3.11` |

## Octane Data

The complete Vite and Rspack adapters accept
`beastOctane({ octane: { dataClient: "./src/data-client.ts" } })`. That module
default-exports a client declared with `defineDataClient` from `octane/data`.
The build emits `/_octane/data-worker.js` and provides `openDataStore` from
`octane/data/client`. Choose either `dataClient` or a hand-written
`dataWorker`. Keep manifest generation enabled when using `dataClient`.

Octane 0.24 also added a dedicated-worker fallback for environments where a
shared worker is unavailable. Octane 0.25 includes the optional `version` of
writes and feeds in the identity used to select a compatible data worker.

## Editor and runtime

The Beast language server uses the project's `compilerOptions.jsxImportSource`
as the default for virtual TSX. Authored JSX pragmas and Octane Strong-mode
defaults still apply.

Octane 0.25 adds `ReactCompatDocument` for React-owned HTML documents and fixes
synchronous writes from watched signal setup when native templates read the
signal directly. See the [Octane changelog] for runtime details.

## Optional scaffold add-ons

Devtools `0.1.23` declares Beast and Octane peers at `^0.13.8`. Page Builder
`0.3.0` depends on Beast and Octane `0.13.8`. The default scaffold uses the
aligned toolchain.

[Octane changelog]: https://github.com/octanejs/octane/blob/octane%400.25.0/packages/octane/CHANGELOG.md
