# Octane 0.13 migration

Beast compiler, create-beast, and the bundled skills target `0.13.8` together
with `octane@0.13.8`. The language server advances independently to `0.2.3`.
Rebuild client and server output together; do not mix compiler output from
different Octane releases. For upgrades from 0.8 or earlier, first read the
[0.12 migration guide](octane-0.12.md).

## Dependencies

```sh
npm install beast-tsrx@0.13.8 octane@0.13.8
npm install --save-dev @tsrx/oxc@0.20.0
```

The explicit Node parser peer remains `0.20.0`; the starters retain
`@tsrx/typescript-plugin@0.6.3`, TypeScript `^5.9.3`, Vite `^8.0.16`, and
Node `>=22.22.2`. Upgrade companion packages across the Octane minor boundary:

| Package | Version | Published Octane peer |
| --- | --- | --- |
| `@octanejs/rspack-plugin` | `0.2.4` | `^0.13.2` |
| `@octanejs/rsbuild-plugin` | `0.1.65` | `^0.13.2` |
| `@octanejs/base-ui` | `0.1.66` | `^0.13.0` |
| `@octanejs/radix` | `0.1.66` | `^0.13.0` |
| `@octanejs/shadcn` | `0.0.55` | `^0.13.0` |
| `@octanejs/remix-router` | `0.1.61` | `^0.13.0` |
| `@octanejs/tanstack-router` | `0.2.10` | `^0.13.0` |

The scaffold pins optional `@beastjs/devtools@0.1.23`, whose Beast and Octane
peers are both `^0.13.8`. This release also updates its Base UI and Motion
dependencies for Octane 0.13. Publish Beast `0.13.8` first, Devtools `0.1.23`
next, and create-beast `0.13.8` after both dependencies are available on npm.
Earlier Devtools releases declare older peers and should be upgraded together.

## Strong templates and diagnostics

BTSX becomes `.tsrx`, so it remains eligible for Strong mode. Octane now rejects
Strong `.tsx`/`.jsx` modules with `OCTANE_STRONG_TSX_MODULE`; convert JSX-bearing
modules to BTSX/TSRX, or keep JSX-free entry modules as `.ts`/`.js`.

`OCTANE_STRONG_ELEMENT_API` rejects descriptor APIs such as `createElement`,
`cloneElement`, `Children`, and JSX-runtime factories in Strong modules.
Template component tags remain valid. `OCTANE_STRONG_SINGLE_ITEM_FOR` rejects
one-item loops used to force remounting. Use an explicit keyed component or
Octane's capitalized `Fragment` component instead:

```btsx
module "use strong";
import { Fragment } from "octane";
import Panel from "./Panel.btsx";
props { selection, panelProps }
Fragment(key={selection})
  Panel({...panelProps} key={selection})
```

The lowercase BTSX `fragment` shorthand remains an unkeyed fragment. Strong
keyed fragments and keyed component spreads now compile without element
descriptors, preserve state across unchanged keys, and dispose owned work when
the key changes. Spread order still determines prop and key precedence.

Octane 0.13 also permits `useMemo` and `useCallback` in Strong code, including
explicit dependencies. This does not relax dependency checks for other hooks.
Eligible object/array props and ref arrays retain identity when their inputs
stay unchanged, including values passed through component children.

Inline TSRX template values can pass through BTSX attribute expressions:

```btsx
module "use strong";
module
  function Slot(props) @{ <section>{props.content}</section> }
Slot(content={@{ <strong>Ready</strong> }})
```

Beast recognizes the embedded markup while matching attribute delimiters.
Octane lowers this direct inline prop to a render body; state and cleanup
belong to the receiving insertion. Ordinary descriptor-valued expressions
retain their separate compatibility semantics.

## Compiled boundaries, SSR, and hydration

Use `CompiledOutlet` for a checked dynamic compiled component and
`createCompiledContext`/`CompiledContext` for a checked context boundary. Pass
compiled template children to `CompiledContext`; element descriptors fail its
runtime contract. These APIs need no Beast-specific syntax.

In 0.13.8, emptying a Provider's children with `null` or `undefined` unmounts
the previous subtree, runs cleanup, and gives restored children fresh state.
This applies to descriptor providers and `CompiledContext`.

Server entry points accept a component element as the component root.
`renderToString(createElement(App, props))` can hydrate using either a matching
component element or `hydrateRoot(container, App, props, options)` while
adopting the original DOM.

Pending or failed query `snapshot()` reads no longer fail server serialization
after a signal-reading module has loaded. Such snapshots render their actual
status without fabricating ready hydration seeds. Clients resolve their own
state or consume streamed results. Strict `get()` reads still require ready
values when a native server read completes. Await `act()` in tests that settle
queries; successful query publication can yield to another host task.

Octane 0.13.6 removes browser-translation DOM accommodation. Preserve framework
text topology and opt owned content out of browser translation in the initial
server HTML when needed.

## Typed output and integration boundaries

With Vite, `beastOctane({ octane: { output: "ts" } })` opts both native Octane
sources and BTSX into Octane's typed intermediate. Beast hands that intermediate
to Vite's OXC transform and composes its map back to authored BTSX. The result
is JavaScript; disabling Vite OXC with this option is an error. Default output
remains JavaScript. The Rspack/Rsbuild plugins do not expose this Vite option.

Octane also exposes typed DOM/SSR and experimental Valdi compiler output and
Valdi adapter types. Beast's tested adapters remain focused on web builds;
this upgrade does not certify a Valdi application pipeline.

Profiling counters use schema 2. Code consuming raw profiling snapshots must
update its schema handling. Octane's Router adapters now support Strong mode
with their authored hook slots. TanStack's opt-in `compiled` router entry and
coordinated Start build option require matching compiled route generation;
existing ordinary router entries remain available.

## Verification

`tests/octane-0.13.test.ts` verifies inline render props, descriptor-free keyed
templates, Strong memo hooks, mapped diagnostics, and server query snapshots.
`tests/runtime.test.ts` covers Provider cleanup, keyed state/effects, compiled
outlet/context updates, and component-element SSR adoption. Vite option and
project suites check typed output, authored source maps, and real mixed-source
builds. Existing Rspack/Rsbuild, language-server, and scaffold suites run against
the upgraded dependencies. Router application lifecycles, raw profiling schema
consumers, and Valdi remain upstream or separate integration coverage.

Sources: [Octane 0.13.8 release](https://github.com/octanejs/octane/releases/tag/octane%400.13.8),
[versioned changelog](https://github.com/octanejs/octane/blob/octane%400.13.8/packages/octane/CHANGELOG.md),
and the compiler, adapter manifests, and regression fixtures at that tag.
