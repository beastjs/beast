# Octane 0.3 migration

Beast compiler, create-beast, and skill version `0.3.2` target `octane@0.3.2`.
The starter pins Rspack plugin `0.1.51` or Rsbuild plugin `0.1.52` when selected,
and uses UI bindings whose peer ranges include Octane 0.3. Rebuild server and
client output together; do not mix compiler/runtime versions across hydration.

## Context

Octane 0.3 removed `Context.Provider`. Render the context object directly:

```btsx
import { createContext, use } from "octane";
module const Theme = createContext("light");
component Label
  setup const theme = use(Theme);
  p #{theme}
Theme(value={"dark"})
  Label
```

Convert actual Octane contexts, including imported contexts, at their authored
BTSX/TSRX sites. Beast still preserves arbitrary dotted components such as
`Menu.Item`; do not strip `.Provider` from unrelated component APIs. Octane
validation diagnoses statically recognized legacy context access.

## Signals and native controls

Importing `octane/signals` enables native reads without a compiler flag. Since
0.2.14, explicit declaration keys use trailing options: `signal$(initial,
{ key })`, `derived$(compute, { key })`, and `query$(select, load, { key })`.
Explicit scope methods such as `scope.signal$(key, initial)` retain their
existing signatures. Replace the removed `scope.asyncSignal$` API with
`createResource(scope, key, describe)` when migrating explicit owners.

Preserve direct writable handles in `textarea(value={draft$})`; using
`draft$.get()` supplies a scalar snapshot with different ownership. Octane
0.3.2 adopts eventless browser-restored textarea values into writable signals
at initial binding, hydration, and accepted early-control takeover, subject to
newer model/native-edit precedence. It also preserves the existing baseline
text node on controlled updates and keeps form reset aligned with the current
value. Test restoration, selection, IME, reset, and browser Undo/Redo when
changing forms; a DOM emulator cannot establish native Undo/Redo behavior.

Keep TypeScript expressions such as `satisfies` intact. Octane owns signal
conversion analysis, scalar binding caches, and hydration wire constants.
Do not duplicate runtime patches or hard-code private hydration markers in
Beast-generated code.

## Native attribute contracts

Pass `octane.knownAttributeSpreads` through the Beast Vite/Rspack/Rsbuild adapter
when a trusted imported factory supplies a fixed native prop shape. Octane can
then lower configured native shorthand such as `sx`, including signal-aware
style objects. This contract does not install StyleX or replace its build
plugin. Use only guarantees the factory actually satisfies.

Sources: [0.3.2 release](https://github.com/octanejs/octane/releases/tag/octane%400.3.2)
and [versioned changelog](https://github.com/octanejs/octane/blob/octane%400.3.2/packages/octane/CHANGELOG.md).
