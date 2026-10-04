# Changelog

All notable changes to the Beast Codex skill are recorded here. See the
repository's [changelog policy](../../docs/changelogs.md).

## [Unreleased]

### Added

- Ship the Beast and React-to-Beast skills together in a versioned
  `beast-skills` GitHub release archive after all repository checks pass.

### Changed

- Target Beast/Octane `0.8.0`, document Strong-mode state/effect and DOM
  diagnostics, and add the Octane 0.8 migration guide. Update router reference
  versions to bindings whose peers accept Octane `^0.8.0`.

- Align the skill target with Beast/Octane `0.7.1`, add the Octane 0.7 migration reference, and list the new `scope`-exit, `textarea`, and `"use strong"` placement errors in the syntax cheatsheet.

- Align the skill target with Beast/Octane `0.6.0` and add the Octane 0.6 migration reference, including the intervening 0.5 changes.

- Align the skill version with the Beast/Octane `0.4.3` release and add the
  Octane 0.4 migration guide for companion package peers, TypeScript in
  `module` blocks, new `Hydrate` diagnostics, and `domBindingFixedProps`.

### Changed

- Align the skill version with the Beast/Octane `0.3.2` release and add the
  migration guide for contexts, signals, textarea restoration, and native
  attribute contracts.

### Changed

- Updated the coverage ledger and compatibility guidance for `octane@0.2.13`
  and the `0.1.50` Rspack/Rsbuild plugins.
- Replaced `nativeReads` build-tool guidance with Octane's automatic signal
  detection, and noted that `textTypes` covers native `.tsrx` only.
- Expanded Strong-mode coverage notes for ambient, module-state, ref, and state
  getter render diagnostics.

## [0.3.0] - 2026-08-29

### Added

- Added authoring guidance for setup-bearing and code-only `scope` children.
- Added build-tool guidance for Octane's experimental `nativeReads` option.

### Changed

- Updated the coverage ledger and compatibility guidance for `octane@0.1.49`
  and the `0.1.44` Rspack/Rsbuild plugins.
- Expanded Strong-mode coverage notes to include nondeterministic render
  diagnostics.

## Before this changelog

Releases through Beast skill `0.2.0` predate this changelog.
