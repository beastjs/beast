# Octane 0.8 migration

Beast compiler, create-beast, and the Beast skill version `0.8.0` target
`octane@0.8.0`. Rebuild client and server output together. The language server
uses the same compiler/runtime pair while retaining its independent version.

## Companion packages

Octane 0.7 peer ranges exclude 0.8. Update the bindings together with Beast:

| Package | Version | Octane peer |
| --- | --- | --- |
| `@octanejs/rspack-plugin` | `0.1.56` | `^0.8.0` |
| `@octanejs/rsbuild-plugin` | `0.1.58` | `^0.8.0` |
| `@octanejs/base-ui` | `0.1.59` | `^0.8.0` |
| `@octanejs/radix` | `0.1.59` | `^0.8.0` |
| `@octanejs/shadcn` | `0.0.48` | `^0.8.0` |
| `@octanejs/remix-router` | `0.1.54` | `^0.8.0` |
| `@octanejs/tanstack-router` | `0.2.0` | `^0.8.0` |

Both starters use `@tsrx/typescript-plugin@0.6.1` for `tsrx-tsc`. Node.js
`>=22.22.2` remains required. Router versions are migration references; the
default starters do not install routers.

## Strong-mode source changes

Put `"use strong"` in a leading `module` block before imports. Existing
compatibility-mode source remains valid. The new conformance tests exercise
these diagnostics through generated BTSX in both client and server builds:

| Diagnostic | Fix |
| --- | --- |
| `OCTANE_STRONG_IMPURE_UPDATER` | Compute side effects and random values in handlers; keep updaters and reducers pure. |
| `OCTANE_STRONG_SNAPSHOT_MUTATION` | Replace state objects and collections with new values. |
| `OCTANE_STRONG_STALE_STATE_UPDATE` | Use `setCount(current => current + 1)` in deferred callbacks. |
| `OCTANE_STRONG_UNCACHED_STORE_SNAPSHOT` | Return a stable stored snapshot from `useSyncExternalStore`. |
| `OCTANE_STRONG_WRITE_ONLY_STATE` | Subscribe to external stores instead of forcing renders with unused state. |
| `OCTANE_STRONG_EFFECT_HIDDEN_DEPENDENCY` | Read reactive snapshots in effect setup; use Effect Events for latest non-reactive reads. |
| `OCTANE_STRONG_EFFECT_RESOURCE_LEAK` | Release acquired timers, listeners, observers, and connections in cleanup. |
| `OCTANE_STRONG_MANAGED_DOM_WRITE` | Express template-owned content and attributes through props or state. |
| `OCTANE_STRONG_RAW_HTML_WRITE` | Use Octane's explicit trusted-HTML prop for trusted or sanitized HTML. |
| `OCTANE_STRONG_OWN_MARKUP_QUERY` | Attach refs to elements the component renders. |
| `OCTANE_STRONG_RENDER_SIDE_EFFECT` | Schedule work in events or effects with cleanup. |

Asynchronous effect-owned state updates also require connected cancellation
or an effect-local guard checked after the final await. Zero-delay scheduling
does not bypass the synchronous effect-update restriction. Strong mode also
checks deterministic formatting and synchronous array callbacks more closely.

Beast reports these errors at the authored BTSX line and removes the generated
TSRX location from the message.

## Bindings and hydration

Zero-argument `"use dom bindings"` views can use imported signal reads,
`try`/`pending`/`catch` arms, and mount-only layout/effect hooks. Such native
TSRX views can be declared in a Beast `module` block. Binding projections must
still prove their text type; an explicit `as string` cast is one supported shape.

`interaction({ events })` accepts `pointermove` and `pointercancel` to extend
an already captured gesture. They do not start hydration by themselves. Event
replays preserve the captured timestamp.

Hydration removes unclaimed server content more consistently. Beast's runtime
tests verify that a shorter client branch removes the server's extra element,
retains the adopted shared root, reports one recovery error, and can update
again in development and production.

Development server rendering accepts `shellWitness` to report client work
outside independent islands. An islands-only shell cannot run that work in
the browser. Custom universal drivers enabling template programs now need
`templates: universalHostTemplates` from `octane/universal` or its native entry.

See [Octane 0.7](octane-0.7.md) for earlier changes. The focused Beast tests
cover the behaviors described above; independent renderer-free island
activation, native browser pointer replay, and custom universal-driver
lifecycles retain upstream coverage.

Source: [Octane 0.8.0 release](https://github.com/octanejs/octane/releases/tag/octane%400.8.0).
