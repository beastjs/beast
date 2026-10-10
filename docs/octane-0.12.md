# Octane 0.12 migration

Beast compiler, create-beast, and the Beast skill version `0.12.1` target
`octane@0.12.1`. This guide covers the upgrade from Beast/Octane 0.8 through
0.9, 0.10, 0.11, and 0.12. Rebuild client and server output together. The
language server retains its independent version and uses the same compiler pair.

## Toolchain and companion packages

Octane moved its Node parser to an optional peer. Every project compiling
Octane in Node, including Beast's CLI and Vite/Rspack/Rsbuild adapters, needs
an explicit `@tsrx/oxc@0.20.0` installation. Both starters install it in
`devDependencies`; the language server includes it as a dependency.

```bash
npm install beast-tsrx@0.12.1 octane@0.12.1
npm install --save-dev @tsrx/oxc@0.20.0
```

Earlier Octane minor peer ranges exclude 0.12. Upgrade installed bindings:

| Package | Version | Octane peer |
| --- | --- | --- |
| `@octanejs/rspack-plugin` | `0.2.2` | `^0.12.0` |
| `@octanejs/rsbuild-plugin` | `0.1.63` | `^0.12.0` |
| `@octanejs/base-ui` | `0.1.65` | `^0.12.0` |
| `@octanejs/radix` | `0.1.65` | `^0.12.0` |
| `@octanejs/shadcn` | `0.0.54` | `^0.12.0` |
| `@octanejs/remix-router` | `0.1.60` | `^0.12.0` |
| `@octanejs/tanstack-router` | `0.2.6` | `^0.12.0` |

Both starters use `@tsrx/typescript-plugin@0.6.3`. Beast keeps TypeScript
`^5.9.3` and Node.js `>=22.22.2`; Octane's TypeScript compiler integration
also supports TypeScript 6 and 7.1 or later. Router packages are migration
references and are not installed by the default starters.

## Literal text and TypeScript output

Native TSRX now treats whitespace-delimited `//` in template children as a
comment. Beast preserves authored BTSX literal text containing those markers
by emitting a string expression. URLs and `a//b` remain text. Beast also emits
decoded ampersands as expressions in text and attributes, preserving entities
such as `&amp;lt;` through the second parser.

Octane 0.12.1 fixes type erasure for native `.ts`, `.mts`, and `.cts` modules:
type-only imports/exports disappear, constructor parameter properties retain
their assignments, and `declare` fields do not become runtime fields. Generic
superclasses and re-exports of imported types now erase correctly in `.tsx`
and `.tsrx`, including native declarations in Beast `module` blocks.

Raw TSRX in `module` blocks follows the native language rules: compute complex
dynamic-tag expressions into a local before using `<{tag}>`, and escape a
static script body's closing-script sequence. Ordinary BTSX literal text is
escaped by Beast.

## New hooks and Strong mode

`useLazyRef(factory)` creates the ref value when its hook cell is initialized
and preserves the ref during later renders. `useRef(callback)` continues to
store the callback itself.

`useLayoutSnapshot(measure, { initial, equal })` derives render output from a
committed DOM measurement. `initial` supplies the first and server values;
the measurement runs synchronously after commits. Subscribe separately when
an external resize or observer must trigger a render.

```btsx
module "use strong";
import { useLazyRef, useLayoutSnapshot, useRef } from "octane";
setup
  const element = useRef<HTMLElement | null>(null);
  const cache = useLazyRef(() => new Map<string, string>());
  const width = useLayoutSnapshot(() => element.current?.offsetWidth ?? 0, { initial: 0 });
section(ref={element})
  output #{width}
```

Strong mode rejects synchronous state updates in host callback refs with
`OCTANE_STRONG_REF_STATE_UPDATE`; DOM measurements belong in
`useLayoutSnapshot`. Async or generator measurements report
`OCTANE_STRONG_LAYOUT_SNAPSHOT_ASYNC`. Effect setup may now read state getters
and value refs. Render-time getter/ref reads remain restricted, and effects
reading reassigned module variables still report hidden dependencies.

Octane also exposes `collectDiagnostics()` for collecting all module
diagnostics and suggested edits. Beast's compiler adapters continue to map the
first thrown Octane error to the authored BTSX location.

## Signals, bindings, and hydration

Opaque holes now bind signal handles only when their module imports
`octane/signals` (a type-only import is sufficient), uses a `$`-named expression,
or declares a DOM-binding view. A runtime signals import also enables native
reads. For untyped handles from a lazily loaded engine, Vite users can set
`beastOctane({ octane: { opaqueSignalHandles: true } })`; Beast forwards this
option to generated TSRX. Rspack/Rsbuild expose the options accepted by their
upstream plugins; type the handles or import their signal types there.

`"use dom bindings"` views can recurse through finite data, including beneath
keyed loops. Declare such native views in a Beast `module` block. Unconditional
recursive cycles are rejected by Octane.

Since 0.10, a structural or text hydration mismatch rebuilds the nearest
Suspense/try/Hydrate boundary or root and reports once through
`onRecoverableError`. Do not expect mismatched server nodes to retain identity.
Attributes and raw HTML are left as authored by the server; development warns
about differences. Matching hydration still adopts existing nodes.

Transitions and deferred values now commit in later host tasks. Tests should
await `act()` or a task instead of only draining microtasks.

## Runtime and renderer changes

Octane 0.12.1 reduces optional runtime code in Vite production builds and fixes
keyed-row caches after suspended root updates. Single-element `memo()` rows
use the element as their boundary, including same-module wrappers. Row-local
component shadows retain the appropriate range when they render multiple nodes.
These improvements apply automatically to compiled BTSX.

Custom writer renderers retain ABI 1 unless they opt into host text or host
refs; opted-in modules guard ABI 2. Signal-owner carriers now store
`SignalOwnerIdentity` rather than assuming every owner is a public `Scope`.
Beast forwards renderer configuration; custom adapter ABI and carrier changes
belong to the adapter implementation.

## Verification scope

`tests/octane-0.12.test.ts` covers literal text/entity preservation, native
TypeScript erasure, module-block generic superclasses/type re-exports, server
hook behavior, Strong diagnostic mapping, effect getter/ref acceptance, and
recursive binding compilation/SSR. `tests/runtime.test.ts` covers lazy-ref
identity, committed layout measurements, memoized keyed DOM identity, suspended
production row updates, hydration fallback, and task-aware transitions.
`tests/octane-options.test.ts` verifies Vite opaque-signal option forwarding.
Existing Vite/Rspack/Rsbuild integration suites execute mixed source builds.

Bundle-size measurements, imported component shadowing, native browser
controlled-input restoration, independent island scheduling, and custom writer
ABI lifecycles retain upstream coverage.

Sources: [Octane 0.12.1 release](https://github.com/octanejs/octane/releases/tag/octane%400.12.1),
[versioned Octane changelog](https://github.com/octanejs/octane/blob/octane%400.12.1/packages/octane/CHANGELOG.md),
and the companion manifests at the same tag. See [Octane 0.8](octane-0.8.md)
for earlier Strong-mode and binding-view changes.
