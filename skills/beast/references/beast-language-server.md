# Beast language server

Read this reference when configuring or troubleshooting editor support for
Beast `.btsx` files.

## Install and launch

Install the server in the Beast project so the editor uses the version pinned
by that project:

```bash
bun add --dev beast-language-server
```

Configure the editor's LSP client to launch the project-local
`beast-language-server` executable with one argument:

```text
--stdio
```

The equivalent shell command is:

```bash
beast-language-server --stdio
```

This is a stdio protocol server. A direct terminal launch normally waits in
silence for LSP messages; silence is not a useful health check. Verify it
through an editor client or an LSP test harness instead.

The published package requires Node.js 22.22.2 or newer and pins a compatible
`beast-tsrx` compiler.

## First-release capabilities

The server provides:

- Beast compiler diagnostics on open and changed documents
- completions for Beast keywords, HTML tags and attributes, workspace
  components, declared component props, and relative import paths
- completion edits that add missing component imports
- go to definition for imports and components
- clickable document links for imports
- document symbols for local component declarations
- component hover details, including declared props and source path
- component references across workspace folders
- incremental document synchronization

Workspace indexing depends on the editor sending the correct workspace folder.
The server supports workspace-folder changes, refreshes its index on save, and
registers a `**/*.btsx` watcher when the client supports dynamic watched-file
registration.

Continuation lines are interpreted as logical source lines for completions and
navigation. Current Beast continuation payloads retain their authored physical
line and column in compiler diagnostics and source maps.

## Boundary with TypeScript and Octane

The initial language-server release is Beast-aware, but it does not provide
TypeScript expression semantics inside BTSX. Do not promise TypeScript member
completion, expression hover, rename, or generated-TSRX navigation from this
release.

Keep the normal project checks alongside editor feedback:

```bash
bun run typecheck
bun run build
```

Compiler diagnostics validate Beast syntax. TSRX-aware type checking and the
configured Vite, Rspack, or Rsbuild production build remain the authority for
TypeScript, Octane, and application integration.

## Troubleshooting

If editor features are missing:

1. Confirm `beast-language-server` is installed in the project and resolves to
   the project-local executable.
2. Confirm the client associates `.btsx` files with the Beast language-server
   configuration and passes `--stdio`.
3. Confirm the opened workspace folder contains the component files; cross-file
   completion, definitions, hover, and references use that index.
4. Save or reopen the affected file if the client does not support dynamic file
   watching.
5. Inspect diagnostics whose LSP source is `beast`, then run the project
   typecheck and build for downstream TypeScript or Octane failures.

The package also exports `BeastLanguageService` for editor integrations and LSP
test harnesses that need the service without starting the stdio process.
