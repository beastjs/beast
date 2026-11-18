# Octane 0.19 migration

Beast compiler, create-beast, and the bundled skills target `0.19.3` together
with `octane@0.19.3`. The language server advances independently to `0.2.5`.
This guide covers Octane 0.16.1 through 0.19.3, including 0.17 and 0.18.
Rebuild client and server output together and deploy them from the same Octane
version. For upgrades from 0.13 or earlier, first read the
[0.16 migration guide](octane-0.16.md).

## Dependencies

```sh
npm install beast-tsrx@0.19.3 octane@0.19.3
npm install --save-dev @tsrx/oxc@0.23.0
```

Octane 0.16.4 moves its exact `@tsrx/oxc` peer from `0.20.0` to `0.23.0`, so
Node compiler projects must update the explicit parser install. The starters
retain `@tsrx/typescript-plugin@0.6.3`, TypeScript `^5.9.3`, Vite `^8.0.16`,
and Node `>=22.22.2`. Upgrade companion packages across the Octane minor
boundary:

| Package | Version | Published Octane peer |
| --- | --- | --- |
| `@octanejs/rspack-plugin` | `0.2.11` | `^0.19.0` |
| `@octanejs/rsbuild-plugin` | `0.2.2` | `^0.19.0` |
| `@octanejs/base-ui` | `0.1.73` | `^0.19.0` |
| `@octanejs/radix` | `0.1.72` | `^0.19.0` |
| `@octanejs/shadcn` | `0.0.62` | `^0.19.0` |
| `@octanejs/remix-router` | `0.1.68` | `^0.19.0` |
| `@octanejs/tanstack-router` | `0.3.5` | `^0.19.0` |

The Rsbuild plugin moves to the `0.2` line. The router bindings keep their
upstream cores: React Router 8.2.0 and `@tanstack/router-core` 1.171.34.

The scaffold still pins optional `@beastjs/devtools@0.1.23`, whose Beast and
Octane peers are `^0.13.8` and do not accept `0.19.3`. Publish a Devtools release
with `^0.19.0` peers and update the create-beast pin before relying on
`--devtools` with this release.

## Lone expressions in directive arms

Since 0.16.4, a lone `{expr}` in a `@{ … }` body or directive arm (`@if`,
`@for`/`@empty`, `@try`/`@pending`/`@catch`) is a compile error. It used to
parse as a JavaScript block and render nothing. Beast already emits text lines
in arms as fragments, so a BTSX arm that interpolates on its own compiles to
the shape Octane now asks for:

```btsx
try
  | #{children}
catch
  p Failed.
```

```tsrx
@try {
	<>{children}</>
} @catch {
	<p>Failed.</p>
}
```

Hand-written TSRX in a `module` section or raw block must use `<>{expr}</>`.

## Stable error codes

Octane 0.16.4 gives authoring errors a stable `code`, such as
`OCTANE_HOOK_IN_LOOP`, `OCTANE_STRONG_READ_ONLY_STATE`, or a `@tsrx/core` code
such as `TSRX2016`. Beast's `BEAST9001_OCTANE` diagnostics now keep that code
at the front of the message when Octane's message does not already include it,
so tools can match `OCTANE_*` codes in Beast output:

```text
Card.btsx:4:3 - BEAST9001_OCTANE: OCTANE_HOOK_IN_LOOP: `useState` is called inside a `for…of` loop …
```

## Strong mode

Octane 0.17 strips `"use strong"` from compiled client and server modules; it
only selects compile-time checks. `module "use strong";` still enables Strong
mode, and other module directives keep their place ahead of generated imports.
Tooling that looked for `"use strong"` in compiled output must check the BTSX or
TSRX source instead.

New Strong diagnostics may reject code that previously compiled:

- `OCTANE_STRONG_READ_ONLY_STATE` rejects a `useState` value whose setter is
  discarded. Use `useInitialValue(value)` for a deliberate mount-time snapshot,
  or `useRef`/`useLazyRef` for a value kept for events and effects.
- `OCTANE_STRONG_DEFERRED_CURRENT_TARGET` rejects `event.currentTarget` read
  after an `await` or in a timer callback.
- `OCTANE_STRONG_LAYOUT_SNAPSHOT_WRITE` rejects DOM writes inside a
  `useLayoutSnapshot` measurement.
- `OCTANE_STRONG_FORCED_LAYOUT` and `OCTANE_STRONG_READ_AFTER_SET` are hints
  that print as build warnings and never fail a module.

Packages can declare Strong mode in `package.json` with
`"octane": { "strong": true }`, and applications can require Strong
dependencies with `compiler.strongDependencies`.

## Runtime, data, and types

Octane 0.17 adds `octane/data` (contracts, a store, server handlers, feeds,
native forms, and an encrypted persistent cache), the layout scheduling APIs
`readLayout`, `writeLayout`, `flushLayoutSync`, `getPhase`, and
`setLayoutSnapshotTiming`, `useInitialValue`, and
`createPortal(children, "body")`. Octane 0.18 reshapes the data bindings
around `store.read(...)` handles and removes `useReadState` and `useWrite`; it
also adds `installTestClock()` to `octane/testing`. Octane 0.19 lets
`flushSync()` run without a callback. BTSX passes all of these through imports
and setup code unchanged.

Type changes from 0.16.4 and 0.16.7 accept readonly dependency lists, React 19
`useRef<T>(null)` overloads, an argument-free `useReducer` dispatch, and
explicit `undefined` under `exactOptionalPropertyTypes`. Imports used only as
types are now dropped from compiled modules, so `import { Icon } from "./Icons"`
no longer needs `type` when `Icon` is only a type.

`OctaneCompat` hosts render `display: contents`, follow React `Activity` and
Suspense hiding, and gain `OctaneCompatInline`. Production bundles keep
shrinking: effects, refs, Suspense, rollback, host descriptors, and hydration
machinery install only from the APIs that need them, and independent `Hydrate`
islands compile to their own boundary entry. None of this needs Beast
configuration.

## Verification

`tests/octane-0.19.test.ts` verifies that compiled modules drop `"use strong"`
while keeping other directives, that lone interpolations in `if`, `each`,
`empty`, `switch`, `try`, and `catch` arms compile in both modes and render on
the server, that stable `OCTANE_*` codes reach mapped BTSX diagnostics on the
authored line, that `OCTANE_STRONG_READ_ONLY_STATE` is rejected while
`useInitialValue` compiles, and that type-only imports are dropped. The 0.12 and
0.16 suites were updated for the read-only-state rule and the stripped Strong
directive. Existing Rspack/Rsbuild, language-server, and scaffold suites run
against the upgraded dependencies. `octane/data`, layout scheduling, the test
clock, and `OctaneCompat` changes remain upstream coverage.

Sources: [Octane 0.19.3 release](https://github.com/octanejs/octane/releases/tag/octane%400.19.3),
[0.19.0](https://github.com/octanejs/octane/releases/tag/octane%400.19.0),
[0.18.0](https://github.com/octanejs/octane/releases/tag/octane%400.18.0),
[0.17.0](https://github.com/octanejs/octane/releases/tag/octane%400.17.0), the
0.16.1–0.16.7 and 0.19.1–0.19.2 releases, and the published companion manifests.
