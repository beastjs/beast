# Third-party bindings

Read this reference when `dependencies.bindingCandidates` is non-empty or the audit reports unknown React-facing packages.

An audit match is a candidate, not a compatibility claim. Octane bindings range from complete ports to scoped or technical-preview packages, and the exact surface can change. Verify the current package README and the official [bindings status table](https://github.com/octanejs/octane/blob/main/docs/bindings-status.md) before installing or editing imports.

## Decide whether a binding is needed

Plain JavaScript packages—validators, date utilities, protocol clients, and framework-independent helpers—usually work unchanged. A binding is relevant when the source package exposes React hooks, React components, React context, a renderer, or React-specific lifecycle behavior.

For each React-facing dependency:

1. Inventory the exact imported exports, deep-import paths, props/options, context providers, CSS/assets, and SSR usage.
2. Find the Octane binding candidate from the audit.
3. Check that every used export exists and read its known differences.
4. Check client behavior, server rendering, hydration, accessibility, and package version compatibility required by this app.
5. Port one representative use and test it before changing all imports.
6. Keep the old dependency until no retained React caller uses it.

Never mass-rewrite package names solely from the audit report.

## Common candidate families

| Source family | Candidate examples | Review focus |
|---|---|---|
| Stores and atoms | `zustand` → `@octanejs/zustand`, `jotai` → `@octanejs/jotai`, `react-redux` → `@octanejs/redux` | Subscription equality, provider/store lifetime, SSR snapshot, devtools |
| Server state | `@tanstack/react-query` → `@octanejs/tanstack-query`, `swr` → `@octanejs/swr`, `@apollo/client` → `@octanejs/apollo-client` | Cache ownership, suspense/errors, dehydration, mutations, optimistic rollback |
| Forms | `react-hook-form` → `@octanejs/hook-form`, `@tanstack/react-form` → `@octanejs/tanstack-form` | Native events, registration refs, validation timing, reset, field arrays, SSR |
| UI primitives | Radix React packages → `@octanejs/radix`, Floating UI → `@octanejs/floating-ui` | Focus management, portals, keyboard interactions, ARIA, controlled state |
| Animation | `framer-motion`/`motion` → `@octanejs/motion`, React Spring → `@octanejs/spring` | Presence/exit behavior, layout measurement, reduced motion, SSR |
| Icons | `lucide-react` → `@octanejs/lucide`, Phosphor React → `@octanejs/phosphor-icons` | Export names, SVG attributes, title/label accessibility, tree shaking |
| Styling | `styled-components` → `@octanejs/styled-components` | SSR extraction, insertion order, theming, generated classes, hydration |
| Testing | `@testing-library/react` → `@octanejs/testing-library` | Render/cleanup API, async settling, event realism, query parity |

For routing candidates, follow the normalized manifest workflow and the protocol-specific [React Router](react-router.md), [TanStack Router](tanstack-router.md), or [Remix](remix-route-modules.md) gate. Resolve Beast, Octane, and router-binding peer versions together before installing.

## Category-specific gates

### Stores

- Confirm selector/equality behavior and whether subscriptions clean up.
- Preserve store scope: module-global, request-local, provider-local, or component-local.
- For SSR, provide a deterministic server snapshot and verify hydration does not leak state between requests.

### Data and query caches

- Preserve query keys, cancellation, retries, stale/cache times, invalidation, and mutation rollback.
- Avoid introducing client waterfalls when server-owned data should remain server-owned.
- Verify dehydrate/hydrate support before choosing an SSR target.

### Forms

- Apply [forms-and-events.md](forms-and-events.md) even when the binding API looks familiar.
- Test registration refs, controlled adapters, schema resolvers, field arrays, native validation, and reset.
- Keep server actions and privileged mutations behind their server contract.

### UI components

- Exercise the complete keyboard/focus/ARIA contract, not only rendering.
- Verify portal targets, dismissal, modality, focus return, layering, and scroll lock.
- Port required global styles, data attributes, and animation hooks.

### Animation

- Check mount/exit presence, interruption, layout measurement, transition completion, and reduced-motion behavior.
- Do not replace a library animation with CSS if JavaScript lifecycle callbacks are part of application behavior.

### Icons

- Prefer direct imports to preserve tree shaking.
- Verify decorative icons remain hidden and meaningful icons retain an accessible name.

## Unknown or partial packages

Choose and record one path:

- retain a framework-independent portion and replace only its React adapter;
- implement the narrow behavior natively in Octane;
- use a verified alternative binding;
- keep the slice in a React-hosted incremental boundary;
- defer the slice.

For a standalone Beast app, do not label a retained React package an “island” unless an actual ownership/transport integration exists and has been tested.
