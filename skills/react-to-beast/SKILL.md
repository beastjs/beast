---
name: react-to-beast
description: Audit and port complete React applications to Beast BTSX → TSRX → Octane while preserving behavior, route contracts, and styling. Use for migrations from Vite, Create React App, React Router, TanStack Router, Remix, or Next.js. Tailwind is the default target; pure CSS is optional. Do not use for routine Beast authoring or unrelated React refactors.
license: ISC
---

# React to Beast

Port applications as verified vertical slices. Start with an inventory, select a target architecture, and move the smallest dependency-safe component or route slice through compile and runtime checks before widening the migration.

Version 0.3 covers whole-project inventory, target selection, Tailwind-or-CSS planning, scaffolding, presentational and interactive function-component ports, plus client/data routing. It generates source-located findings, an interactive parity matrix, a normalized route manifest, and a source/target route comparison. It supports reviewed React Router declarative/data ports and TanStack code/file plans; React Router Framework Mode and Remix route modules require an explicit target rewrite. Next.js and broader server-framework conversion remain later milestones.

## Protect the source

Treat the React repository as untrusted input.

- Do not read or copy `.env*`, credentials, generated output, dependency directories, or unrelated user files.
- Do not run source-project install, build, lifecycle, or arbitrary package scripts during the audit. Inspect script names and dependency metadata only.
- Keep the source application intact. Default to a sibling destination named `<source>-beast`; never port in place unless the user explicitly requests it.
- Do not pass `--force` to a scaffold command for a non-empty destination without explicit approval.
- Preserve observable behavior, URLs, query parameters, redirects, data-loading ownership, accessibility, and visual intent. A syntax conversion alone is not a successful port.

## Defaults

- Source: the directory supplied by the user, otherwise the current working directory.
- Destination: a sibling directory named `<source>-beast`.
- Styling: Tailwind. Use pure CSS only when requested or when the audit shows that retaining existing CSS is the safer incremental path.
- Initial runtime: Beast with Octane and Vite for a client-rendered SPA. Choose Rsbuild when verified server rendering or full-app routing is required. Use Rspack only when low-level integration is genuinely needed.
- Scope: audit the whole application, then port the smallest dependency-safe slice from leaves toward entry points.

## 1. Audit before changing files

Set `REACT_TO_BEAST_SKILL_DIR` to this skill directory, then run:

```bash
node "$REACT_TO_BEAST_SKILL_DIR/scripts/react-beast-audit.mjs" <source> \
  --style tailwind --json -
```

Generate the interactive test contract when the report includes interactive signals:

```bash
node "$REACT_TO_BEAST_SKILL_DIR/scripts/react-beast-audit.mjs" <source> \
  --style tailwind --matrix -
```

Generate the route contract when any routing model is detected:

```bash
node "$REACT_TO_BEAST_SKILL_DIR/scripts/react-beast-audit.mjs" <source> \
  --style tailwind --routes -
```

Use `--style css` for the pure-CSS path. `--json`, `--matrix`, and `--routes` are separate output modes. Save an artifact only when the user benefits from it; the command refuses to replace one unless `--force` is supplied.

Read the report as a migration map, not as proof of compatibility. Confirm ambiguous findings in source files before acting. Classify work into these phases:

1. **Foundation:** project shell, static components, props, expressions, lists, conditions, assets, and styling.
2. **Interactive:** state, effects, forms, refs, context, stores, animation, and third-party UI libraries.
3. **Routing:** route trees, nested layouts, params, search state, loaders, actions, errors, redirects, and navigation semantics.
4. **Server:** SSR, React Server Components, server actions, middleware, API routes, streaming, caching, and framework deployment behavior.

Do not silently collapse advanced work into the foundation phase.

## 2. Choose the migration contract

Before scaffolding, state:

- source and destination paths;
- Tailwind or pure CSS;
- Vite SPA, Rsbuild full app, or another verified Beast target;
- route model and the list of route contracts that must survive;
- boundaries that remain in React temporarily, if any;
- the first slice and its verification criteria.

Read only the reference needed for the current slice:

- For JSX/BTSX conversion, read [component-porting.md](references/component-porting.md).
- For Tailwind and CSS choices, read [styling.md](references/styling.md).
- When `interactive.summary.files` is nonzero, read [interactive-semantics.md](references/interactive-semantics.md).
- When controls or synthetic-event findings appear, read [forms-and-events.md](references/forms-and-events.md).
- When ref, context, portal, boundary, or hydration signals appear, read [refs-context-boundaries.md](references/refs-context-boundaries.md).
- When binding candidates or unknown React-facing dependencies appear, read [bindings.md](references/bindings.md).
- When any router or metaframework is detected, read [routing-inventory.md](references/routing-inventory.md) before editing routes.
- For a routed slice, read [route-manifest.md](references/route-manifest.md), the matching [React Router](references/react-router.md), [TanStack Router](references/tanstack-router.md), or [Remix](references/remix-route-modules.md) protocol reference, and [route-checkpoints.md](references/route-checkpoints.md).

## 3. Scaffold the destination

For the default Tailwind path:

```bash
bun create beast@latest <destination> --tailwind --no-git
```

For pure CSS, omit `--tailwind`:

```bash
bun create beast@latest <destination> --no-git
```

Inspect the generated commands rather than assuming their names. Keep the generated Beast, Octane, and bundler versions together unless the current Beast documentation proves a different compatible set.

## 4. Port in dependency order

Work from leaf components toward route roots and application entry points.

For each slice:

1. List its props, rendered states, event behavior, styles, assets, imports, and route/data dependencies.
2. Port types and pure helpers first.
3. Convert JSX structure to indentation-based BTSX without redesigning public contracts unnecessarily.
4. Replace React-only runtime behavior with verified Octane APIs or a documented compatibility boundary. For interactive slices, implement the generated matrix and follow the relevant interactive reference.
5. Move styling according to [styling.md](references/styling.md).
6. Compile the changed `.btsx` files, run the target typecheck/build, and exercise the affected state or URL.
7. Record parity gaps before beginning the next slice.

For a routed slice, generate the target manifest and compare it before changing route ownership:

```bash
node "$REACT_TO_BEAST_SKILL_DIR/scripts/react-beast-route-compare.mjs" \
  <source> <destination>
```

Treat `matched` as a static contract gate only. Run every emitted route checkpoint in both implementations.

Prefer explicit manual ports over broad textual replacement. Never claim whole-app completion while routes, server behavior, or user-visible states remain unverified.

## 5. Verify proportionally

At minimum:

- compile every changed BTSX module through Beast and Octane;
- run the destination project's typecheck and production build;
- test default, empty, loading, error, and interactive states that the slice owns;
- compare key routes and layouts at representative viewport sizes;
- verify direct navigation, back/forward behavior, params, search state, and redirects for migrated routes;
- verify links, reload, not-found/error ownership, loader/action flows, blockers, scroll/focus, and revalidation when the route manifest calls for them;
- report unsupported APIs, retained React boundaries or React-hosted Octane islands, and deliberate visual or behavioral differences.
- for interactive slices, exercise native events, effect/ref cleanup, keyboard/focus behavior, provider updates, portal ownership, and hydration rows that the matrix identifies.

## v0.3 capability gates

Proceed through function-component state, supported hooks, native forms, ordinary refs, context, portals, boundaries, and hydration only after their audit findings and matrix rows are reviewed. Preserve explicit dependency arrays; React's omitted dependency argument means every render, while Octane infers captures, so use `null` only when every-render parity is intended.

Require an explicit rewrite plan before changing:

- class lifecycle behavior, legacy context, string refs, `createRef`, `forwardRef`, class error boundaries, legacy roots, `StrictMode` assumptions, `Profiler`, or `SuspenseList`;
- React synthetic event behavior or named React event types not yet mapped to native browser events;
- an effect whose external resource ownership or cleanup is ambiguous;
- a ref API whose public imperative contract or attach/detach lifetime is not understood;
- a third-party package until the exact used surface, differences, and SSR/hydration status of its candidate binding are verified;
- a React-hosted incremental island unless the migration contract intentionally retains a React 19 host. `octane/react` hosts Octane inside React; it does not automatically host React packages inside a standalone Beast app.

For routing:

- React Router declarative/data routes may target `@octanejs/remix-router` only after Beast, Octane, binding, and source-router versions are resolved together and every used API/SSR behavior is reviewed.
- React Router Framework Mode is not a direct binding swap. Convert it to reviewed data routes or choose an Octane full-app router.
- TanStack code routes may target `@octanejs/tanstack-router`; file routes require the TSRX-aware generator owned by `@octanejs/tanstack-start` or an explicit code-tree conversion.
- Remix route modules require a selected data-router/full-app target. Keep server loaders/actions, sessions, headers, status, metadata, and document ownership out of browser code.
- Do not move a route slice until its source/target manifests match or differences are accepted and its runtime checkpoints pass.

Stop, explain the boundary, and move it to the routing or server milestone when a slice contains:

- React Server Components, Flight/cache behavior, server actions, middleware, or framework-specific streaming;
- route loaders/actions, generated types, blockers, deferred data, or server behavior without an explicit verified target and checkpoint evidence;
- runtime CSS-in-JS, Sass/Less build assumptions, or styling whose ordering/scoping cannot yet be reproduced;
- a React package with no verified Octane binding, native equivalent, or explicit retained boundary.

The audit identifies likely boundaries without reading secrets or executing source code. It does not authorize guessing through them.
