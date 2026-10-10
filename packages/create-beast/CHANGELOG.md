# Changelog

All notable changes to `create-beast` and its generated starter projects are
recorded here. See the repository's [changelog policy](../../docs/changelogs.md).

## [Unreleased]

## [0.12.1] - 2026-10-10

### Added

- A local demo that packs the current CLI and compiler and runs full setup
  before publication, preserving projects and earlier compiler snapshots.
- A final selection after installation and add-on initialization: open a shell
  in the project, or open it and run the development server. Automation and
  deferred installation print next commands instead.
- Optional Devtools and Page Builder with Vite, Rspack, and Rsbuild integration,
  Beast UI initialization with Tailwind, and the typed Beast icon pipeline.
- `--yes` / `-y`, `--no-addons`, `--devtools`, `--page-builder`, `--beast-ui`,
  and `--icons` flags. Deferred and failed setup prints remaining commands.
- Attach the checked `create-beast` npm archive to coordinated GitHub releases
  for manual publication.

### Changed

- Replace numbered readline menus with compact arrow-key choices, an optional
  tools checklist, a small wordmark, and quiet progress. Respect `NO_COLOR`
  and noninteractive/CI defaults; prompt cancellation exits before writing files.
- Pin Beast and Octane to `0.12.1`, Rspack/Rsbuild plugins to `0.2.2`/`0.1.63`,
  Base UI and Radix to `0.1.65`, and shadcn to `0.0.54`. The companion peers
  accept Octane `^0.12.0`.
- Install the required Node compiler peer `@tsrx/oxc@0.20.0` explicitly in both
  starters and update `@tsrx/typescript-plugin` to `0.6.3`.

## [0.8.0] - 2026-10-04

### Changed

- Pin Beast and Octane to `0.8.0`, Rspack/Rsbuild plugins to `0.1.56`/`0.1.58`,
  Base UI and Radix to `0.1.59`, and shadcn to `0.0.48`. All companion bindings
  use the Octane `^0.8.0` peer line.
- Use `@tsrx/typescript-plugin@0.6.1` in both starters.

## [0.7.1] - 2026-10-03

### Changed

- Replace both starters with a single quiet screen: one headline, a stateful counter, and a keyed loop over resource links in about 30 lines of BTSX. The stylesheet shrinks from the orbital hero and workflow explorer to a short sheet of custom properties with automatic light/dark themes and reduced-motion support.

- Align create-beast and generated Beast/Octane pins with `0.7.1`. Update Rspack/Rsbuild plugins to `0.1.55` / `0.1.57`, Base UI and Radix to `0.1.58`, and shadcn to `0.0.47`, whose peer ranges accept Octane 0.7.

## [0.6.0] - 2026-09-27

### Changed

- Redesign both starters with a charcoal and pale-green palette, oversized typography, an animated orbital hero, and a responsive workflow explorer. Add keyboard tab navigation, reduced-motion styling, and clipboard success/failure feedback.

- Align create-beast and generated Beast/Octane pins with `0.6.0`. Update Rspack/Rsbuild plugins to `0.1.54` / `0.1.56`, Base UI and Radix to `0.1.57`, and shadcn to `0.0.46`, whose peer ranges accept Octane 0.6.

## [0.4.3] - 2026-09-24

### Changed

- Aligned create-beast version `0.4.3` with Octane and pinned generated projects
  to `beast-tsrx@0.4.3` and `octane@0.4.3`.
- Updated Rspack/Rsbuild plugins to `0.1.52` / `0.1.54` and UI bindings to
  Base UI `0.1.55`, Radix `0.1.55`, and shadcn `0.0.44`, whose peer ranges
  accept Octane 0.4.

## [0.3.2] - 2026-09-20

### Changed

- Aligned create-beast version `0.3.2` with Octane and pinned generated projects
  to `beast-tsrx@0.3.2` and `octane@0.3.2` rather than a floating compiler.
- Updated Rspack/Rsbuild plugins to `0.1.51` / `0.1.52` and UI bindings to
  Base UI `0.1.54`, Radix `0.1.54`, and shadcn `0.0.43`, whose peer ranges
  accept Octane 0.3.

## [0.2.62] - 2026-09-18

### Changed

- Updated generated projects to pin `octane@0.2.13`, and Rspack and Rsbuild
  projects to the `0.1.50` Octane plugins.

### Fixed

- Starter READMEs and the generated `App.btsx` badge announced `octane@0.1.49`
  while the template pinned a newer Octane. Both now report the pinned version.

## [0.2.61] - 2026-09-18

### Added

- Rspack and Rsbuild projects now resolve `@/*` imports from `src` through a
  `resolve.alias` entry that matches the generated `tsconfig.json` paths.

### Fixed

- Generated Vite projects keep the `@/*` source alias and Node types; the
  bundler-specific config previously replaced the template's `vite.config.ts`
  and `tsconfig.json` types without them.

### Changed

- Updated generated projects to pin `octane@0.2.8`, and Rspack and Rsbuild
  projects to the `0.1.49` Octane plugins.
- Replaced the opt-in `nativeReads` guidance in template documentation with
  Octane's automatic `octane/signals` detection.

## [0.2.12] - 2026-08-29

### Added

- Added a starter-project `CHANGELOG.md` to both CSS and Tailwind templates.
- Added a scoped-child setup example to the generated showcase application.

### Changed

- Updated generated projects to pin `octane@0.1.49`.
- Expanded template documentation for Beast `scope`, reproducible checks, and
  opt-in Octane `nativeReads` configuration.

## Before this changelog

Releases through `create-beast@0.2.11` predate this changelog.
