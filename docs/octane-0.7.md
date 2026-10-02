# Octane 0.7 migration

Beast compiler, create-beast, and skill version `0.7.1` target `octane@0.7.1`.
Rebuild client and server output together. The language server pins this
compiler/runtime version, while retaining its own package version.

## Companion packages

Octane 0.6 peer ranges do not include 0.7. Upgrade bindings together. The
tested starter defaults and router reference versions are:

| Package | Version | Octane peer |
| --- | --- | --- |
| `@octanejs/rspack-plugin` | `0.1.55` | `^0.7.0` |
| `@octanejs/rsbuild-plugin` | `0.1.57` | `^0.7.0` |
| `@octanejs/base-ui` | `0.1.58` | `^0.7.0` |
| `@octanejs/radix` | `0.1.58` | `^0.7.0` |
| `@octanejs/shadcn` | `0.0.47` | `^0.7.0` |
| `@octanejs/remix-router` | `0.1.53` | `^0.7.0` |
| `@octanejs/tanstack-router` | `0.1.60` | `^0.7.0` |

## What changes for BTSX

BTSX control-flow arms (`if`, `each`, `switch`, `try`) have no setup of their
own, so Octane 0.7's directive-arm early-exit rework reaches BTSX mainly through
`scope`, which lowers to an `@{ … }` block.

- **`break`/`continue` cannot leave a `scope`.** A `scope` is a nested template,
  not a directive arm. `setup if (!item) continue;` inside a `scope` in an
  `each` row is now a compile error. Before, the module compiled and then
  failed to load with "Illegal continue statement". Filter the iterable before
  the `each`, or render the row's content from an `if` arm.
- **`textarea` children must be text.** Inline text and `#{…}` interpolations
  render as one run of text on both sides, with no hydration markers in the
  default value. An element child, such as `textarea` with a nested `span`, is
  a compile error.
- **`"use strong"` belongs in `module`.** In `setup` it lands in a function
  body. Octane used to ignore it there and compile in compat mode. It now
  reports `OCTANE_STRONG_DIRECTIVE_PLACEMENT`. Put the directive at the top of
  a `module` block.
- **Compound components via `Object.assign`.** A local `component` with
  `if`/`each` arms can be attached as `Object.assign(Item, { Item })` from a
  `module` block and rendered as `Menu.Item`. 0.7.1 fixes the 0.7.0 regression
  that rewrote such functions as call targets.
- **Row keys.** Beast hoists a `key={…}` on an `each` row's only root into the
  `@for` header. Octane 0.7 now treats the root attribute the same way, so the
  generated TSRX is unchanged and runs identically.

Beast maps the new template errors back to the authored `.btsx` line. Some of
them only carry a location in the error message (`textarea` children,
`scope` exits), not in a `loc` field. `mapGeneratedError` now also reads that
message suffix. It accepts an optional generated-TSRX argument so it can resolve
offset-only parser errors.

A `return` in a `scope`'s setup has always been rejected by Octane, but without
any location. Beast now reports it itself as `BEAST1904_SCOPE_RETURN`, pointing
at the keyword. Octane allows a `return` inside a loop body or a nested
function, and Beast leaves those alone.

## Runtime changes worth knowing

These need no source change but can change observable behavior:

- `useOptimistic` without a reducer now treats a function action as an updater
  of the pending state, as `useState` does, instead of storing the function.
- Queued `useActionState` dispatches run the action that was current when
  dispatched, matching React 19.
- Hydration now reports, and repairs, many stale-server-content shapes it used
  to keep silently: list length mismatches, text-versus-element holes, and
  parser-repaired markup such as a `div` inside a `p`. Expect new
  `onRecoverableError` reports where server and client output disagree. These
  reports expose existing bugs and are not regressions.
- A reassigned variable read by JSX is captured when the JSX evaluates, as in
  React. A counter incremented in a `.map` callback no longer shows its final
  value in every row.
- In Node, Octane now reads `process.env.NODE_ENV` once per module through a
  `node` export condition. Set `NODE_ENV` before the first Octane import in
  custom server entries.
- Production builds report signal, hydration, and DOM-binding errors as
  `Minified Octane error #<code>` messages (inherited from 0.6.1).

For earlier changes, see [Octane 0.6](octane-0.6.md).

Sources: [0.7.1 release](https://github.com/octanejs/octane/releases/tag/octane%400.7.1),
[0.7.0 release](https://github.com/octanejs/octane/releases/tag/octane%400.7.0),
and the 0.6.1–0.6.3 patch releases.
