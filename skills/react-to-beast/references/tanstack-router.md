# TanStack Router ports

TanStack Router code-based and file-based trees share runtime capabilities but have different generation contracts. Preserve typed route identity, not just rendered links.

## Version gate

The executable compatibility set in this skill is:

- `beast-tsrx@0.2.7`;
- `octane@0.1.37`;
- `@octanejs/tanstack-router@0.1.36`, whose peer is Octane 0.1.37.

The binding reuses TanStack's framework-neutral core and implements the Octane component/hook layer. Resolve peer versions together and verify the binding's pinned upstream router/core versions before porting generated types.

## Code-based trees

Map `createRootRoute`, `createRoute`, `addChildren`, and `createRouter` to `@octanejs/tanstack-router`. Keep:

- `getParentRoute` identity and pathless layouts;
- `$param` and splat semantics;
- `validateSearch`, defaults, serialization, and inherited search types;
- `loaderDeps`, `beforeLoad`, route context, auth redirects, loaders, stale times, and preloading;
- pending/error/not-found components and boundary placement;
- link masks, active/inactive props, blockers, scroll restoration, and router events;
- lazy components and code-split route ownership.

The audit normalizes `$projectId` to `:projectId` only for cross-router comparison; keep TanStack's original typed syntax in TanStack target code.

Refs are ordinary props, link callbacks receive native events, and router devtools ship separately. Recheck any React-event assumptions.

## File-based trees

TanStack recommends file routing, but it relies on generated route IDs and type relationships. For Beast, select one of these explicit strategies:

1. use `@octanejs/tanstack-start` with the TSRX-aware generator plugin exported by `@octanejs/tanstack-router/generator-plugin`; or
2. convert the generated/file tree to a reviewed code-based tree and accept that architecture change.

Do not hand-edit `routeTree.gen.*`, rename route files, or convert `.tsx` templates to `.btsx` until the selected generator proves it recognizes the target extensions and preserves source offsets. Confirm root, index, dot/directory nesting, `$` params, `_` pathless layouts, non-nested suffixes, excluded files, and lazy-route naming.

## Search and data ownership

TanStack search values are JSON-first, validated, typed, and inherited through the route tree. Preserve the validator, default/catch behavior, parser/serializer, middleware, loader dependencies, and navigation update rules. A plain `URLSearchParams` replacement is not automatically equivalent.

For every `beforeLoad`, loader, or mutation, choose browser versus server execution explicitly. Keep abort/cancellation, caching, preload, pending time, error/not-found propagation, redirect status/history, and invalidation semantics.

The binding provides client/server SSR entries and full-document/head/script support, while Octane TanStack Start owns the full-app generator and server-function integration. Validate direct requests, stream/hydration data, CSP nonce, route-owned head assets, and per-route SSR mode when using them.

Official references: [route trees](https://tanstack.com/router/latest/docs/routing/route-trees), [file routing](https://tanstack.com/router/latest/docs/routing/file-based-routing), [file naming](https://tanstack.com/router/latest/docs/routing/file-naming-conventions), [search params](https://tanstack.com/router/latest/docs/guide/search-params), and [Octane binding status](https://github.com/octanejs/octane/blob/main/docs/bindings-status.md).
