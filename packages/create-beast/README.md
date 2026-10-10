# create-beast

Create a Beast, TSRX, and Octane project with a quiet, keyboard-driven setup:
project directory, bundler, UI primitives, optional tools, and styling.
Use arrow keys to navigate, Space to select tools, and Enter to continue.
All tools start unselected. Escape or Ctrl+C cancels the configuration prompts before any
project files are written. `NO_COLOR=1` disables color.

```bash
bun create beast@latest
```

Pass a directory to skip the prompt: `bun create beast@latest my-app`.

## Test the CLI before release

From the Beast repository, run:

```bash
bun run demo:create
```

This builds and packs the current builder and compiler, then runs the full
interactive CLI. Demo projects go under `.release/create-beast-demo/projects/`
and install the local Beast compiler tarball, so an unpublished compiler
version can be tested with real dependency installation and both final actions.
The remaining packages install from npm normally. Give each trial a different
directory name.

To prepare the demo first and run it separately:

```bash
bun run demo:prepare
bun .release/create-beast-demo/run.mjs
```

Both launch commands accept normal creator arguments. Refreshing the preview
preserves previous projects and the compiler snapshots they depend on.

## Published CLI

The equivalent direct `bunx` command is:

```bash
bun x create-beast@latest my-app
```

Choose Vite, Rspack, or Rsbuild at the prompt. Choose Base UI, Radix, or shadcn
to install the corresponding `@octanejs/*` binding. You can make the same
choices non-interactively:

```bash
bun create beast@latest my-app --bundler rsbuild --ui shadcn --yes
```

Use `--yes` (or `-y`) to accept defaults for any unanswered prompts. Piped
commands and CI use defaults automatically. `--no-addons` skips the tools
checklist; explicit tool flags also supply that choice.

After dependency installation and any selected UI/icon initialization finish,
the last prompt offers:

1. **Open project directory** — enter an interactive shell in the new folder.
2. **Open and run project** — enter the folder and start `bun run dev` with
   live server output. Stopping the server leaves a project shell ready to use.

The shell uses your `SHELL` on macOS/Linux (falling back to `/bin/sh`) or
`ComSpec` on Windows (falling back to `cmd.exe`). A child CLI cannot change its
parent shell's directory, so it opens a shell with the project as its working
directory. Type `exit` to return to the original shell. Cancelling the final
menu keeps the finished project and prints the next commands. `--yes`, CI,
piped commands, and `--no-install` skip this menu and print commands as usual.

## Optional tools

```bash
bun create beast@latest my-app --devtools --page-builder --beast-ui --icons --yes
```

| Flag | Setup |
| --- | --- |
| `--devtools` | Install `@beastjs/devtools` and add its selected bundler adapter. Enable Octane profiling in development. Open with Alt+Shift+D. |
| `--page-builder` | Install `@beastjs/page-builder` and add its selected bundler adapter. Open with ⌘B / Ctrl+B. |
| `--beast-ui` | Install `@beastjs/cli`, enable Tailwind v4, and run `beast-ui init --package-manager bun` after installation. |
| `--icons` | Install `@beastjs/cli` and run `beast-ui icons init --framework beast` after installation. Works independently of Beast UI. |

Both development widgets are configured for Vite, Rspack, and Rsbuild. Page
Builder can inspect the starter, but creating routes requires an existing
TanStack router and an app shell with an Outlet.

Beast UI initialization creates `beast-ui.json`; add source components with
`bun run beast-ui add button`. The starter already supplies Tailwind and the
TypeScript/bundler `@/*` alias.

Icon initialization creates `scripts/build-icons.ts`, `src/lib/icons/Icon.btsx`,
typed exports and SVG directories under `src/lib/icons/`, and the
`icons:build` and `icons:check` scripts. Add SVGs and import
`{ Icon }` from `@/lib/icons`. The equivalent direct setup commands are:

```bash
bun x @beastjs/cli init --package-manager bun
bun x @beastjs/cli icons init --framework beast
```

Use `--no-install` to write the scaffold without running installation or either
initializer. The final output and generated README contain the commands to
finish setup. A failed install or initializer preserves the project and prints
the unfinished commands along with the failure details.

Use `--no-git`, `--force`, or `--tailwind` when needed. `--force` writes known
template files into a non-empty directory while preserving unrelated files;
the add-on initializers retain their own conflict checks.

Add `--tailwind` to scaffold with Tailwind CSS through the selected bundler's
adapter and `@import "tailwindcss"`.
The shadcn choice enables Tailwind automatically.

Every bundler resolves `@/*` imports from `src`, matching the generated
`tsconfig.json` paths, so `.btsx`, `.tsrx`, and TypeScript modules can use
`import Card from "@/components/Card.btsx"` in Vite, Rspack, and Rsbuild projects.

Release `0.12.1` mirrors Octane. Both templates pin `beast-tsrx@0.12.1` and `octane@0.12.1`, include TSRX-aware type checking,
a production-build check, a project-owned `CHANGELOG.md`, and a deliberately small
`App.btsx`: one headline, a stateful counter, and a loop over resource links, so
the first edit replaces it rather than untangles it. Both variants share the same
markup and a single stylesheet with automatic light/dark themes and reduced-motion
support; the Tailwind variant also loads Tailwind v4.

Octane signals need no build option. Import `octane/signals` in a `.btsx` or
`.tsrx` module to enable native signal reads there.

Package changes are tracked in [CHANGELOG.md](CHANGELOG.md).

Node compiler builds require `@tsrx/oxc@0.20.0`, included explicitly in the
starter. The TSRX type-checking plugin is pinned to `0.6.3`.
