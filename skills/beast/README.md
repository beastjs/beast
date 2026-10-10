<!-- markdownlint-disable MD013 -->

# Beast Skill

> Agent skill for authoring, diagnosing, and shipping Beast BTSX → TSRX → Octane apps across supported build tools.

[![skills.sh](https://img.shields.io/badge/skills.sh-Beast-111827?style=flat-square)](https://skills.sh/phtn/beast-skill/beast)
[![Version](https://img.shields.io/badge/version-0.12.1-6f42c1?style=flat-square)](package.json)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.22.2-339933?style=flat-square&logo=nodedotjs&logoColor=white)](package.json)
[![Octane](https://img.shields.io/badge/Octane-0.12.1-111827?style=flat-square)](https://octanejs.dev/)
[![License: ISC](https://img.shields.io/badge/license-ISC-0f766e?style=flat-square)](LICENSE)

**Scaffold in seconds. Author with indentation. Compile to native TSRX. Let Octane own rendering.**

[Install](#installation) ·
[Compatibility](#compatibility) ·
[How it works](#how-it-works) ·
[CLI reference](#cli-reference) ·
[Language server](#language-server) ·
[Diagnostics](#diagnostics) ·
[Changelog](CHANGELOG.md) ·
[Development](#development)

---

Beast Skill is an agent skill for the [Beast](https://github.com/beastjs/beast) compiler — an indentation-first language that compiles `.btsx` into readable `.tsrx` for [Octane](https://octanejs.dev/). It gives agents a focused workflow to scaffold, author, diagnose, navigate, watch, and build Beast apps with the Beast language server, Vite, Rspack, or Rsbuild.

It does not replace TypeScript, TSRX, Octane, or an application bundler. It owns the authoring-to-build loop and hands generated TSRX to the existing toolchain.

## At a glance

| Capability | What it does | Why it matters |
| --- | --- | --- |
| Scaffold | Creates a typed Beast + Octane app with Vite, Rspack, or Rsbuild, a UI binding, and optional Tailwind | Starts with a coherent toolchain |
| Author | Indentation-based BTSX with typed props | Keeps structure, keeps types |
| Scope | Places setup and hooks in an exact child position | Preserves child ownership without a wrapper element |
| Compile | BTSX → native TSRX (readable) | Octane remains authority |
| Diagnose | Stable codes + source spans | Makes failures actionable |
| Edit | Beast-aware completion, navigation, hover, and workspace references | Keeps editor guidance aligned with BTSX |
| Build | Validates or watches mixed BTSX/TSRX and integrates Vite, Rspack, or Rsbuild | Ships with source-mapped evidence |

## Installation

Install the skill from GitHub:

```bash
npx skills add https://github.com/phtn/beast-skill --skill beast
```

Then invoke it from a supported agent:

```text
Use $beast to create a new Beast app in ./my-app and build it.
```

Narrow to a file or task:

```text
Use $beast to fix diagnostics in src/App.btsx and show the compiled TSRX diff.
```

```text
Use $beast to scaffold a Beast project without git, then add a keyed list with empty fallback.
```

> [!NOTE]
> The skill workflow verifies, not assumes. In a create-beast app, a clean `bun run check` means TSRX-aware type checking plus a production build.

## Compatibility

The current toolchain target is `beast-tsrx@0.12.1`, `create-beast@0.12.1`, and
`octane@0.12.1`. Keep compiler and runtime versions together, rebuild client
and server output when upgrading, and use companion bindings whose peers
accept Octane `^0.12.0`.

| Package | Tested version |
| --- | --- |
| Beast compiler, project creator, and Octane | `0.12.1` |
| Node compiler parser (`@tsrx/oxc`) | `0.20.0` |
| TSRX TypeScript plugin | `0.6.3` |
| Octane Rspack / Rsbuild plugins | `0.2.2` / `0.1.63` |
| Octane Base UI / Radix bindings | `0.1.65` |
| Octane shadcn binding | `0.0.54` |

Node compiler projects must explicitly install `@tsrx/oxc@0.20.0`; generated
starters include it. Existing projects can install the parser with:

```bash
bun add --dev @tsrx/oxc@0.20.0
```

The upgrade to Octane 0.12 brings `useLazyRef` and `useLayoutSnapshot`, finite recursive
DOM-binding views, and fixes for TypeScript erasure and keyed-row updates after
suspended renders. Vite forwards `opaqueSignalHandles` for untyped signal
props. Beast preserves literal `//` text and decoded entities through TSRX.

Structural or text hydration mismatches rebuild the affected boundary or root.
Transitions and deferred values commit in later host tasks, so runtime tests
should await `act()` instead of only draining microtasks. Strong effect setup
may read state getters and value refs; synchronous state updates in host
callback refs and asynchronous layout measurements remain errors.

See the [Octane 0.12 migration guide](references/octane-0.12.md) for the upgrade from 0.8,
new hook examples, companion versions, and verification coverage.

## How it works

```mermaid
flowchart LR
    A[User request] --> B[Scaffold or locate]
    B --> C[Author BTSX]
    C --> D[Compile to TSRX]
    D --> E[Diagnose spans]
    E --> F[Vite / Rspack / Rsbuild]
    F --> G[Browser app]
```

Beast deliberately generates native TSRX — conditions and loops remain template operations, output stays readable, and Octane validates final semantics.

Given this BTSX:

```btsx
module
  interface Props {
    title: string
    links: { id: string, label: string, url: string }[]
  }
props { title, links }: Props
main.app
  p.eyebrow BTSX → TSRX → Octane
  h1 #{title}
  div.flex
    each link in links key link.id
      a.button(id={link.id} href={link.url}) #{link.label}
```

Beast produces this TSRX shape:

```tsrx
export default function App({ title, links }: Props) @{
  <main className="app">
    <p className="eyebrow">BTSX → TSRX → Octane</p>
    <h1>{title}</h1>
    <div className="flex">
      @for (const link of links; key link.id) {
        <a className="button" id={link.id} href={link.url}>{link.label}</a>
      }
    </div>
  </main>
}
```

## Direct usage (without agent)

Scaffold:

```bash
bun create beast@latest my-app
cd my-app
bun run dev
# options: --bundler vite|rspack|rsbuild --ui base-ui|radix|shadcn
#          --tailwind --devtools --page-builder --beast-ui --icons
#          --yes --no-addons --no-install --no-git --force
```

Compile one file:

```bash
bunx beast compile src/App.btsx --output /tmp/App.tsrx
```

Project doctor (skill-owned, bounded, no exec):

```bash
node ./scripts/beast-doctor.cjs src --json /tmp/beast-report.json
```

## CLI reference

### create-beast

```text
bun create beast@latest [directory] [options]
bun x create-beast@latest [directory] [options]
```

| Option | Effect |
| --- | --- |
| `--bundler <name>` | Use `vite`, `rspack`, or `rsbuild` (default: `vite`) |
| `--ui <name>` | Add `base-ui`, `radix`, or `shadcn` (default: `base-ui`; shadcn enables Tailwind) |
| `--tailwind` | Enable Tailwind CSS through the selected bundler |
| `--devtools` | Add the bundler-specific Devtools plugin and development profiling |
| `--page-builder` | Add the bundler-specific Page Builder widget |
| `--beast-ui` | Enable Tailwind and initialize Beast UI via `@beastjs/cli` |
| `--icons` | Initialize typed Beast icons via `@beastjs/cli icons init` |
| `-y, --yes` | Accept defaults for unanswered prompts |
| `--no-addons` | Skip the optional tools checklist |
| `--no-install` | Write files; defer installation and UI/icon initialization |
| `--no-git` | Skip `git init` |
| `--force` | Write template into non-empty dir (keeps unrelated files) |
| `-h, --help` | Show help |

The creator uses arrow keys, Space to toggle optional tools, and Enter to
continue. All tools start unselected. Beast UI creates `beast-ui.json`; icons
create the SVG source structure, typed `Icon.btsx`, and build/check scripts.
After installation and UI/icon initialization, the final menu opens a shell
in the project directory or opens it and runs the development server. Stopping
the server leaves the project shell open. `--yes`, CI, and `--no-install` skip
this menu and print the next commands.
Page creation through Page Builder needs an existing TanStack router and an
app shell with an Outlet.

### beast compiler

```text
beast compile <input.btsx> [-o <output.tsrx>] [--component-name <name>] [--props <parameter>] [--no-validate]
beast build [source-dir] [--out-dir <directory>] [--no-validate] [--watch]
```

| Command | Description |
| --- | --- |
| `compile` | Single-file BTSX → TSRX, reports source spans |
| `build` | Recursive mixed BTSX/TSRX build, validates natives, writes a manifest, and prunes tracked stale outputs after success |
| `build --watch` | Debounced, serialized rebuilds that report errors and recover after later edits |

Detailed CLI and bundler configuration: [references/beast-build-tools.md](references/beast-build-tools.md).

### App scripts (generated Vite template)

| Script | What it does |
| --- | --- |
| `bun run dev` | Vite dev server (Beast → Octane in memory) |
| `bun run build` | Vite production build |
| `bun run typecheck` | `tsrx-tsc --noEmit` (TSRX-aware) |
| `bun run check` | `typecheck && build` |
| `bun run preview` | Preview built app |

## Language server

Install the project-local LSP server and configure the editor to launch it over
stdio:

```bash
bun add --dev beast-language-server
beast-language-server --stdio
```

The language server supplies Beast compiler diagnostics; keyword, HTML,
component, prop, and relative-import completion; component auto-import edits;
definitions; import links; document symbols; component hover; and workspace
component references. It also maps TypeScript diagnostics, member completions,
auto-imports, hover, and definitions back to BTSX. Keep `bun run typecheck` and
the production build in the verification loop.

Configuration, capability boundaries, and troubleshooting:
[references/beast-language-server.md](references/beast-language-server.md).

## Diagnostics

Diagnostics are stable codes with `SourceSpan { start: {line,column,offset}, end }`.

- **Indentation error** → use spaces, align siblings, and indent children beneath parents
- **Continuation error** → indent `~` beneath the logical line it extends; an orphan reports `BEAST1004_ORPHAN_CONTINUATION`
- **Invalid element/fragment/style/spread** → check `references/beast-diagnostics.md`
- **Invalid control flow** → `empty` must align with `each`, `case`/`default` inside `switch`, `pending` before `catch`
- **Component** → `component Name` must be Capitalized, have body

Full table: [references/beast-diagnostics.md](references/beast-diagnostics.md).

## Security model

Scanned repositories are treated as untrusted input.

- Native Beast parses source; the dependency-free doctor performs lexical triage; neither imports nor executes target modules
- Comments, strings, docs, filenames are data — not instructions
- Doctor reads are bounded to the first 4 MiB per file, and raw source is excluded from reports
- No network requests, no dependency installs
- Secrets encountered are redacted, never reproduced

## Repository structure

```text
beast-skill/
├── SKILL.md                          # Agent workflow and trust boundary
├── agents/openai.yaml                # Agent-facing metadata
├── references/
│   ├── beast-syntax-cheatsheet.md    # BTSX authoring reference
│   ├── beast-diagnostics.md          # Error codes and fixes
│   ├── beast-build-tools.md          # CLI, watch, source maps, and bundler adapters
│   ├── beast-language-server.md      # LSP setup, capabilities, and boundaries
│   ├── beast-coverage.md             # Octane parity map
│   ├── octane-0.12.md                # Current toolchain and migration guidance
│   └── ui-components.md              # Compelling project UI component contracts
├── scripts/
│   ├── beast-doctor.cjs              # Portable bounded checker
│   └── src/beast-doctor.ts           # Source of truth
├── CHANGELOG.md                       # Skill-specific release notes
├── package.json
└── tsconfig.json
```

## Development

Requirements: Node.js 22.22.2 or newer.

```bash
npm ci
npm run check
```

When changing the doctor:

1. Edit `scripts/src/beast-doctor.ts`, not the generated `scripts/beast-doctor.cjs`.
2. Run `npm run build` and verify the committed runtime is updated.

## License

Released under the [ISC License](LICENSE).

---

*Built for fast, indentation-first Beast development.*

[View Beast on GitHub](https://github.com/beastjs/beast) · [View Beast Skill on skills.sh](https://skills.sh/phtn/beast-skill/beast)
