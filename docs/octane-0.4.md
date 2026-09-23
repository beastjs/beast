# Octane 0.4 migration

Beast compiler, create-beast, and skill version `0.4.3` target `octane@0.4.3`.
The starter pins Rspack plugin `0.1.52` or Rsbuild plugin `0.1.54` when selected.
Rebuild server and client output together; do not mix compiler/runtime versions
across hydration. Projects still on Octane 0.2 should first apply the
[Octane 0.3 migration](octane-0.3.md), especially direct context providers.

## Companion packages

Octane 0.4 is a new peer line. Upgrade every `@octanejs/*` binding with the
runtime; 0.3-era releases do not accept `octane@0.4`:

| Package | Version | Octane peer |
| --- | --- | --- |
| `@octanejs/rspack-plugin` | `0.1.52` | `^0.4.0` |
| `@octanejs/rsbuild-plugin` | `0.1.54` | `^0.4.3` |
| `@octanejs/base-ui` | `0.1.55` | `^0.4.0` |
| `@octanejs/radix` | `0.1.55` | `^0.4.0` |
| `@octanejs/shadcn` | `0.0.44` | `^0.4.0` |
| `@octanejs/remix-router` | `0.1.50` | `^0.4.0` |
| `@octanejs/tanstack-router` | `0.1.57` | `^0.4.0` |

A linked or workspace package outside `node_modules` that receives Octane
through a shared toolkit can declare `"octane": { "source": true }` in its
manifest instead of adding an `octane` range it does not own. Installed
packages must still declare an `octane` dependency.

## TypeScript in module blocks

Octane now lowers runtime TypeScript declarations in `.tsrx` to the JavaScript
tsc emits for ES2022, and Beast passes `module` blocks through verbatim. Enums,
`const enum` (emitted as a regular enum), value namespaces, `import X = A.B`,
and class parameter properties therefore work in BTSX:

```btsx
module
  enum Tone { Calm, Loud = "loud" }
p #{Tone[Tone.Calm]}
```

`export =`, `import x = require(…)`, destructured exports inside a namespace,
and an uninitialized enum member after a non-constant member are compiler
errors. Beast reports them against the authored `.btsx` location. Avoid naming
a module declaration after the file's default component. BTSX derives that name
from the filename, and the two declarations merge.

## Diagnostics and runtime behavior

- Reading `Context.Provider` in development now throws
  `[OCTANE_CONTEXT_PROVIDER]`, including for contexts imported from another
  module. Render `Theme(value={theme})` instead.
- Independent `Hydrate` boundaries activate on `idle()`, `visible()`, and
  `media()`. `condition()` or a function-form `when` is rejected with
  `OCTANE_HYDRATE_INDEPENDENT_WHEN`. Captures initialized by destructuring
  defaults, functions, or classes are rejected with
  `OCTANE_HYDRATE_INDEPENDENT_OWNER_CAPTURE`.
- Keyed `@for` rows that read module `let`/`var` state or host globals such as
  `location` stay live. Do not work around stale active-row rendering.
- An empty `{x as string}` text hole between siblings now hydrates correctly.
- Compiled output marks direct `createContext`, `memo`, `lazy`, and
  `createPortal` calls `/* @__PURE__ */`, so esbuild can drop unused ones.
  Do not add these annotations to BTSX by hand.
- `createResizeObserver` delivers coalesced resize notifications in a separate
  task. Base UI measurement components and Floating UI's element-resize adapter
  use it, which is part of why their bindings now peer on Octane 0.4.

## Build adapters

The Beast Vite adapter forwards `octane.domBindingFixedProps` to the compiler
used for generated BTSX. The option specializes `"use dom bindings"` child
programs for caller-fixed primitive props, and BTSX can export such views from
a `module` block. Octane's Rspack and Rsbuild plugins do not expose this option
yet, so it is Vite-only. `knownAttributeSpreads` forwarding is unchanged.

Sources: [0.4.3 release](https://github.com/octanejs/octane/releases/tag/octane%400.4.3)
and [versioned changelog](https://github.com/octanejs/octane/blob/octane%400.4.3/packages/octane/CHANGELOG.md).
