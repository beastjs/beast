# Octane 0.6 migration

Beast compiler, create-beast, and skill version `0.6.0` target `octane@0.6.0`.
Rebuild client and server output together. The language server also pins this
compiler/runtime version, while retaining its own package version.

## Companion packages

Upgrade bindings together: Octane 0.4 and 0.5 peer ranges do not include 0.6.
The tested starter defaults and router reference versions are:

| Package | Version | Octane peer |
| --- | --- | --- |
| `@octanejs/rspack-plugin` | `0.1.54` | `^0.6.0` |
| `@octanejs/rsbuild-plugin` | `0.1.56` | `^0.6.0` |
| `@octanejs/base-ui` | `0.1.57` | `^0.6.0` |
| `@octanejs/radix` | `0.1.57` | `^0.6.0` |
| `@octanejs/shadcn` | `0.0.46` | `^0.6.0` |
| `@octanejs/remix-router` | `0.1.52` | `^0.6.0` |
| `@octanejs/tanstack-router` | `0.1.59` | `^0.6.0` |

## BTSX compilation

- Setup-bearing `scope` blocks now lower to persistent universal child scopes,
  including scopes inside control flow. JSX values in setup statements also
  use universal helpers when a universal renderer is selected.
- Assigned style blocks retain element and descendant selectors, including
  rules applying to elements carrying one of the block's class entries.
- JSX spread children (`<div>{...items}</div>`) are unsupported and now produce
  compiler/editor diagnostics. Use a BTSX `for` block to render a collection.
  Beast maps Octane's compiler error back to the authored BTSX location.
- Octane fixes hydration boundaries for render-function children alongside
  component siblings. Recompile both sides to receive the fix.

## Optional native form capture

BTSX passes through `data-octane-capture-submit="owner-key"` on native forms.
Octane's parser-time SSR bootstrap must opt in to form submissions, and the
owning behavior root must pass `formSubmissions: captureFormSubmissions()`.
The factory is exported from `octane/behavior` and `octane`. Captured commands
include accepted fields and submitter metadata; unclaimed commands have a
bounded lease. Forms without the opt-in retain native behavior.

Beast does not automatically enable this application-level behavior. Its
regressions check attribute preservation and public exports; they do not
simulate parser-time browser submission delivery.

## Changes inherited from 0.5

- Custom SSR hosts can share `initialDocumentSignals` across server rendering
  and hydration. Use the same immutable initial seed for both sides.
- Signal-only TSRX modules no longer activate a renderer. A rendering module
  using native signal reads needs its own `octane/signals` import.
- Eager imported signal `.get()` reads in DOM binding activation are diagnosed.
  Pass a live handle or intentionally sample through a binding source snapshot.
- Universal `else if` chains return their selected values; unkeyed universal
  loops use positional keys. Keep explicit keys for reorderable stateful rows.
- Switch arms have separate scopes, and CSS `@import` inside a style block is
  a compiler error. Put stylesheet imports outside scoped style blocks.

For earlier changes, see [Octane 0.4](octane-0.4.md) and
[Octane 0.3](octane-0.3.md).

Sources: [0.6.0 release](https://github.com/octanejs/octane/releases/tag/octane%400.6.0)
and [versioned changelog, including 0.5.0](https://github.com/octanejs/octane/blob/octane%400.6.0/packages/octane/CHANGELOG.md).
