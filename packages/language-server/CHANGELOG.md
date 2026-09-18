# Changelog

All notable changes to `beast-language-server` are recorded here. See the
repository's [changelog policy](../../docs/changelogs.md).

## [Unreleased]

### Changed

- Depends on `octane@0.2.13` for TSX virtual code, and on `beast-tsrx@^0.2.61`
  so the language server tracks the compiler's Octane peer range.


## [0.2.1] - 2026-09-14

### Fixed

- `fragment` elements no longer report "Property 'fragment' does not exist on
  type 'JSX.IntrinsicElements'". Other unknown lowercase elements are still reported.

## [0.2.0] - 2026-09-14

### Added

- Added `scope` to Beast keyword completions for Octane child scopes.
- Added TypeScript checking for `.btsx` files: components are lowered through
  Octane's TSX virtual code, so reference and type errors report at their Beast
  location, including props passed to imported `.btsx` components.
- Added TypeScript completions in embedded expressions, with auto-imports from
  workspace `.ts` modules, plus TypeScript hover and go-to-definition.

### Changed

- Depends on `octane@0.2.8` for TSX virtual code and `beast-tsrx@0.2.60`.

### Fixed

- TypeScript diagnostics no longer analyze raw TSRX, which TypeScript cannot
  parse, and no longer hide the resulting syntax errors.

## Before this changelog

Releases through `beast-language-server@0.1.0` predate this changelog.
