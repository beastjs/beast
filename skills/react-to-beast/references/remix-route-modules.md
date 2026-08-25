# Remix route-module migrations

Remix route files combine URL matching, server requests, document metadata, mutations, and rendering. The `@octanejs/remix-router` package ports React Router's data/declarative runtime; it does not implement Remix/React Router Framework Mode request handling. Treat every Remix migration as a target rewrite.

## Inventory the file convention

Record `app/root.*` and every `app/routes` entry, including:

- `_index`, dot/directory nesting, dynamic `$param`, optional segments, splats, pathless leading underscores, and trailing-underscore non-nesting;
- route folders whose `route.*` file owns the URL;
- custom `routes` configuration and ignored-file rules;
- root document ownership, `Outlet`, `Meta`, `Links`, `Scripts`, and `ScrollRestoration`.

The audit infers standard flat-route paths and marks them `filesystem-inferred`. Confirm custom conventions manually.

## Inventory every route export

Classify default component, `loader`, `clientLoader`, `action`, `clientAction`, `ErrorBoundary`, `HydrateFallback`, `meta`, `links`, `headers`, `handle`, and `shouldRevalidate`. Trace server-only imports, cookies/sessions, authentication, secrets, status codes, response headers, thrown responses, redirects, streaming/deferred values, and resource routes.

Never move a Remix loader or action into a Vite browser bundle just because the Octane data router accepts the same property names.

## Choose an explicit target

### Data-router rewrite

Convert route modules to `RouteObject` entries for `@octanejs/remix-router`. Select who handles direct HTTP requests. For an SPA, privileged work remains behind typed endpoints. For SSR, implement and verify static handler/router, status, headers, redirects, sessions, document shell, and hydration.

### Full-app router rewrite

Choose an Octane full-app integration such as TanStack Start only after mapping Remix params/search, request context, cache/revalidation, forms/fetchers, errors, metadata, sessions, and deployment behavior to the target protocol. Generated route types do not transfer automatically.

### Retained service or route family

Keep Remix ownership temporarily behind an explicit URL or network handoff. Record auth/session sharing, redirects, asset/base paths, error ownership, observability, and rollback. Port presentational leaves separately only when their serialized inputs are safe and stable.

## Verify the rewrite

Generate the source manifest, build the target slice, compare manifests, then test direct loads, links, reload, back/forward, params, search, loaders, actions/forms/fetchers, pending/error/not-found, redirects, blockers, scroll/focus, status/headers, and hydration where applicable.

Official references: [Remix route file naming](https://v2.remix.run/docs/file-conventions/routes/), [loaders](https://v2.remix.run/docs/route/loader/), [actions](https://v2.remix.run/docs/route/action/), and [Octane binding status](https://github.com/octanejs/octane/blob/main/docs/bindings-status.md).
