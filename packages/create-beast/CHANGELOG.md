# Changelog

All notable changes to `create-beast` and its generated starter projects are
recorded here. See the repository's [changelog policy](../../docs/changelogs.md).

## [Unreleased]

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
