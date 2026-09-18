# Changelog

All notable changes to `create-beast` and its generated starter projects are
recorded here. See the repository's [changelog policy](../../docs/changelogs.md).

## [Unreleased]

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
