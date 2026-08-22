# Routing inventory

Version 0.3 recognizes route protocols, emits a normalized route manifest, and compares source/target route contracts. It does not blindly rewrite route trees. Routing is application architecture: preserve URLs and behavior before optimizing syntax.

Use [route-manifest.md](route-manifest.md) for the artifact and comparison workflow. Then read the protocol reference that applies: [react-router.md](react-router.md), [tanstack-router.md](tanstack-router.md), or [remix-route-modules.md](remix-route-modules.md). Use [route-checkpoints.md](route-checkpoints.md) before a route slice takes ownership.

## Record every route contract

For each route or route family, capture:

- pathname pattern, dynamic params, optional/catch-all segments, and trailing-slash rules;
- search parameter schema and defaulting behavior;
- nested layout/outlet ownership;
- loader, action, mutation, revalidation, and cache behavior;
- pending, empty, error, not-found, and redirect states;
- authentication, authorization, middleware, and headers;
- scroll restoration, focus movement, blockers, and back/forward behavior;
- server/client execution boundary and deployment assumptions;
- metadata, document shell, and API/resource-route behavior.

Test direct navigation as well as in-app navigation. A port that only works after landing on `/` has not preserved the route contract.

## Detection matrix

| Source protocol | Common signals | Migration concern |
|---|---|---|
| React Router declarative mode | `BrowserRouter`, `Routes`, `Route` | Nested element tree, params, outlets, navigation |
| React Router data mode | `createBrowserRouter`, loaders/actions, `RouterProvider` | Data lifecycle, redirects, errors, revalidation |
| React Router framework mode | route config, route modules, generated types | Framework build contract and route-module APIs |
| TanStack Router | `createRouter`, generated `routeTree`, file routes | Typed params/search, loaders, code splitting, generation |
| Remix | `app/routes`, loaders/actions, route modules | Server/client split, forms, headers, mutations |
| Next.js Pages Router | `pages`, `_app`, `_document`, API routes, data methods | Per-page data modes, document shell, server APIs |
| Next.js App Router | `app`, layouts, special files, server/client directives | React Server Components, streaming, cache, server actions |
| Custom/history router | history APIs, manual pathname switches | Undocumented matching and navigation rules |

An application may contain more than one model during a migration. Report all of them rather than choosing the first import found.

## Select a Beast target

- Use a Vite SPA for client-rendered route trees when a verified Octane binding covers the required surface.
- Use Rsbuild's full-app route support when verified SSR or route rendering is required.
- Use Rspack only for a low-level integration that the higher-level targets cannot express.

Known Octane binding package names are candidates, not blanket compatibility guarantees. For example, `@octanejs/remix-router` and `@octanejs/tanstack-router` still require API-by-API review against the source application's usage.

Do not begin route editing until the target owns equivalents for every required contract, or the user has accepted a documented change.

## Next.js boundaries

Inventory Pages Router and App Router separately, including mixed applications.

For the App Router, distinguish server components from client components and trace each server-only import, fetch, cache directive, server action, middleware rule, route handler, metadata function, loading boundary, error boundary, and not-found boundary. Never:

- add `"use client"` broadly to make imports compile;
- move a server fetch, secret, database call, or privileged SDK into browser code;
- convert server actions to ordinary client callbacks without replacing transport, validation, authentication, and mutation semantics;
- flatten nested layouts without checking state preservation and streaming behavior.

For the Pages Router, map `getStaticProps`, `getStaticPaths`, `getServerSideProps`, `_app`, `_document`, API routes, rewrites, redirects, headers, and image/font behavior before choosing SPA or server rendering.

## Handoff across boundaries

When a route or server boundary cannot move in the current phase, isolate it behind typed serializable props or an explicit network contract. Keep data ownership where it is safe, port the presentational leaf, and record what must happen before the boundary can be removed.

Do not call an application fully ported while live traffic still depends on an undocumented React route, server endpoint, or client-only fallback.
