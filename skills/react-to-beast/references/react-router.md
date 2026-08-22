# React Router ports

React Router has three additive modes. Identify the top-level API before choosing a Beast target; shared component names do not make the modes interchangeable.

| Source mode | Primary signals | Beast/Octane target |
|---|---|---|
| Declarative | `BrowserRouter`, `Routes`, `Route`, `useRoutes` | `@octanejs/remix-router`, after surface/version review |
| Data | `createBrowserRouter`, `RouterProvider`, loaders/actions | `@octanejs/remix-router`, with explicit client/server ownership |
| Framework | `@react-router/dev/routes`, route modules, generated `+types` | Rewrite to reviewed data routes or an Octane full-app router |

The current Octane binding deliberately exposes throwing stubs for React Router Framework Mode and RSC APIs. Never translate Framework Mode by replacing its package name.

## Version gate

The executable fixtures in this skill pin:

- `beast-tsrx@0.2.7`;
- `octane@0.1.37`;
- `@octanejs/remix-router@0.1.33`, which peers on Octane 0.1.37 and ports React Router 8.2.0.

Resolve the installed Beast, Octane, and binding peer versions together. Do not install the latest router binding with an older Beast peer by suppressing package-manager checks. Also review source-version changes: React Router 8 consolidates browser APIs into `react-router`, makes middleware unconditional, and removes older future flags.

## Declarative mode

Preserve the nested route tree, index/pathless routes, ranking, basename, links, active states, params, search, blockers, and history behavior. The binding supports descriptor children and native TSRX/BTSX block children, but block-child route registration is client-only. Use route descriptors/objects for SSR.

Refs are ordinary props in Octane. Link callbacks receive native browser events, not React synthetic events. Recheck any handler that relies on React event types or `nativeEvent`.

## Data mode

Prefer route objects as the migration contract. Map each property deliberately:

| React Router contract | Target review |
|---|---|
| `loader` | Browser or server execution, request context, abort signal, cache, response/error behavior |
| `action`, `Form`, `useSubmit`, `useFetcher` | Transport, validation, auth, mutation result, redirect, revalidation |
| `errorElement` / `ErrorBoundary` | Exact owning route and surviving parent layouts |
| pending/Await | Navigation state, fallback owner, deferred value/error behavior |
| `redirect` | Replace/push history, status/headers, direct request behavior |
| `useBlocker` / prompt | Dirty-state lifetime, confirm UX, retry/reset |
| `ScrollRestoration` | Keying, saved positions, hash/focus behavior |
| `shouldRevalidate` / revalidator | Invalidations after action, search changes, explicit refresh |

For a Vite SPA, loaders/actions may execute in the browser. Do not move a server-only loader, secret, database client, cookie/session mutation, or privileged SDK there. Choose a verified server target or retain a typed endpoint boundary.

Static SSR is available through the binding's `StaticRouter`, `StaticRouterProvider`, `createStaticHandler`, and `createStaticRouter` surface. Treat HTTP status, headers, redirects, sessions, streaming, and hydration as separate proof obligations.

## Framework mode

Inventory route config and each route module before rewriting:

- path/index/layout/prefix and generated types;
- `loader`, `action`, middleware, and server-only imports;
- `ErrorBoundary`, `HydrateFallback`, meta/links/headers/handle;
- SPA/SSR/SSG configuration, code splitting, request handler, and deployment adapter.

Then choose either:

1. explicit data-route objects on `@octanejs/remix-router`, plus a verified server boundary if needed; or
2. an Octane full-app router whose generator and server runtime own the equivalent contracts.

Run the normalized manifest comparison and all route checkpoints after the rewrite.

Official references: [React Router modes](https://reactrouter.com/start/modes), [route modules](https://reactrouter.com/start/framework/route-module), and [Octane binding status](https://github.com/octanejs/octane/blob/main/docs/bindings-status.md).
