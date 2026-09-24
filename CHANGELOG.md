# Changelog

All notable changes to `beast-tsrx` are recorded here. The repository maintains
separate changelogs for independently versioned deliverables; see
[the changelog policy](docs/changelogs.md).

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.3] - 2026-09-24

### Changed

- Aligned `beast-tsrx` with `octane@0.4.3`; raised the Octane peer minimum to
  `^0.4.3` and the Rspack/Rsbuild plugin peers to `^0.1.52` / `^0.1.54`.
- Octane errors mapped back to `.btsx` no longer repeat the generated TSRX
  location when Octane includes a filename in the suffix.

### Added

- The Vite adapter forwards `octane.domBindingFixedProps` to the compiler for
  generated BTSX, so `"use dom bindings"` views exported from a `module` block
  can specialize caller-fixed primitive props.
- Coverage for TypeScript enums and value namespaces in `module` blocks, which
  Octane 0.4.3 lowers to JavaScript for client and server output.

### Migration

- Upgrade `@octanejs/*` bindings to their Octane `^0.4.0` releases together with
  the runtime. See the [Octane 0.4 migration guide](docs/octane-0.4.md).

## [0.3.2] - 2026-09-20

### Changed

- Aligned `beast-tsrx` and `create-beast` versions with `octane@0.3.2`; raised
  the Octane peer minimum to `^0.3.2` and tested Rspack/Rsbuild plugins
  `0.1.51` / `0.1.52`.
- Migrated context examples to direct context providers after Octane removed
  `Context.Provider`. Generic dotted component references remain supported.
- Forwarded `knownAttributeSpreads` through Vite, Rspack, and Rsbuild for native
  attribute factories and configured `sx` lowering.

### Added

- Development/production regressions for restored writable textarea hydration,
  native-edit baseline identity, form reset, and live signal conversion after
  `satisfies`-wrapped constructor writes.
- Project-build coverage for source-mapped legacy-provider diagnostics.

### Migration

- Rebuild server and client output together. Use `Theme(value={theme})` instead
  of `Theme.Provider(value={theme})` for contexts returned by `createContext`.
- See the [Octane 0.3 migration guide](docs/octane-0.3.md) for
  signal declaration keys, removed `scope.asyncSignal$`, and native controls.

## [0.2.62] - 2026-09-18

### Changed

- Updated the supported Octane toolchain to `octane@0.2.13` with
  `@octanejs/rspack-plugin@0.1.50` and `@octanejs/rsbuild-plugin@0.1.50`.
- Relaxed the `octane` peer range to `^0.2.8` and the Octane bundler-plugin peer
  ranges to `^0.1.49`. Octane publishes compatible patch releases faster than
  Beast cuts releases, and the exact pin blocked installs on any newer Octane.
  Beast's generated TSRX is byte-identical across `octane@0.2.8` through
  `0.2.13`; development still pins one exact, tested toolchain.

### Notes

- Octane 0.2.13 changes its compiler site identity, so server and client output
  must be rebuilt and deployed together when upgrading. Mixed output causes
  hydration identity mismatches for controls in conditional, loop, and switch
  arms.

## [0.2.61] - 2026-09-18

### Added

- Added Strong-mode regression coverage for Octane 0.2.8 render diagnostics:
  ambient browser-state reads, reassigned module bindings, `useRef.current`
  reads, and state getter calls.
- Added signal-detection coverage: an `octane/signals` import enables native
  reads in generated BTSX, while `$`-suffixed names alone do not.

### Changed

- Updated the supported Octane toolchain to `octane@0.2.8` with
  `@octanejs/rspack-plugin@0.1.49` and `@octanejs/rsbuild-plugin@0.1.49`.
- Documented that Octane's experimental `textTypes` TypeScript text proof
  applies to native `.tsrx` modules, not generated BTSX.

### Removed

- Removed `nativeReads` forwarding from the Vite, Rspack, and Rsbuild adapters.
  Octane 0.2.7 made signals stable and detects them automatically, and the
  0.1.49 Rspack loader rejects the option as unknown.

## [0.2.9] - 2026-08-29

### Added

- Added `scope` syntax for setup-bearing and code-only nested Octane child
  scopes introduced by Octane 0.1.47.
- Added compiler-option forwarding tests for Octane's experimental
  `nativeReads` mode across Vite, Rspack, and Rsbuild.
- Added Strong-mode regression coverage for nondeterministic render calls.

### Changed

- Updated the supported Octane toolchain to `octane@0.1.49` with
  `@octanejs/rspack-plugin@0.1.44` and
  `@octanejs/rsbuild-plugin@0.1.44`.
- Forwarded `nativeReads` through every complete Beast–Octane bundler adapter.
- Updated Octane coverage documentation and router-binding compatibility
  references for the current toolchain.

### Fixed

- Made the Vite adapter honor Octane's HMR, profiling, forced SSR, renderer,
  exclusion, and directive options for generated BTSX modules.

## Before this changelog

Releases through `beast-tsrx@0.2.8` predate the component changelog. Use the
repository's Git history and release tags when researching those versions.
