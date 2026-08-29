# Changelog

All notable changes to `beast-tsrx` are recorded here. The repository maintains
separate changelogs for independently versioned deliverables; see
[the changelog policy](docs/changelogs.md).

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
