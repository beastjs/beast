# Octane 0.16 migration

Beast compiler, create-beast, and the bundled skills target `0.16.0` together
with `octane@0.16.0`. The language server advances independently to `0.2.4`.
This guide covers Octane 0.14, 0.15, and 0.16. Rebuild client and server output
together and deploy them from the same Octane version: 0.14 changes the server
HTML that hydration reads. For upgrades from 0.12 or earlier, first read the
[0.13 migration guide](octane-0.13.md).

## Dependencies

```sh
npm install beast-tsrx@0.16.0 octane@0.16.0
npm install --save-dev @tsrx/oxc@0.20.0
```

The explicit Node parser peer remains `0.20.0`; the starters retain
`@tsrx/typescript-plugin@0.6.3`, TypeScript `^5.9.3`, Vite `^8.0.16`, and
Node `>=22.22.2`. Upgrade companion packages across the Octane minor boundary:

| Package | Version | Published Octane peer |
| --- | --- | --- |
| `@octanejs/rspack-plugin` | `0.2.8` | `^0.16.0` |
| `@octanejs/rsbuild-plugin` | `0.1.69` | `^0.16.0` |
| `@octanejs/base-ui` | `0.1.69` | `^0.16.0` |
| `@octanejs/radix` | `0.1.69` | `^0.16.0` |
| `@octanejs/shadcn` | `0.0.58` | `^0.16.0` |
| `@octanejs/remix-router` | `0.1.64` | `^0.16.0` |
| `@octanejs/tanstack-router` | `0.3.2` | `^0.16.0` |

The router bindings keep their upstream cores: React Router 8.2.0 and
`@tanstack/router-core` 1.171.34.

The scaffold still pins optional `@beastjs/devtools@0.1.23`, whose Beast and
Octane peers are `^0.13.8` and do not accept `0.16.0`. Publish a Devtools release
with `^0.16.0` peers and update the create-beast pin before relying on
`--devtools` with this release.

## Hydration protocol and server errors

Octane 0.14 changes the server HTML twice over (protocol versions 2 and 3).
Every hydratable root now opens with `<!--3-->`. A Suspense boundary is one
range whose opening comment records its state: `<!--[$:N-->` for content,
`<!--[$?id-->` for a streamed boundary, and `<!--[$!…-->` for one the client
renders. The `oct-suspense:`, `oct-seed:`, `oct-client:`, `oct-client-error:`,
and `oct-native-fresh:` comments are gone. A root whose server rendered another
version renders on the client and reports error 348 through
`onRecoverableError`. Tests or tooling that match server HTML must update their
expectations. `renderToStaticMarkup` still emits no comments.

Server render errors follow React. An error or rejected `use()` inside a
Suspense boundary ships that boundary's fallback, marked for the client to
render, and no part of the error reaches the page. The client renders the
boundary afresh. In the BTSX shape below, a rejected `profile` now serializes
`Profile failed.` in a client-render range instead of `Loading profile…`, and
hydration keeps the ErrorBoundary fallback:

```btsx
ErrorBoundary(fallback="Profile failed.")
  Suspense(fallback="Loading profile…")
    AsyncProfile(profile={profile})
```

A server error with no Suspense boundary above it now fails the render:
`renderToString` throws, `prerender` rejects, and a stream calls
`onShellError`. Wrap content that may fail on the server in a Suspense
boundary.

Hydration adopts by structure. A structural mismatch regenerates the nearest
Suspense or `Hydrate` boundary, or the root, and reports one `HydrationMismatch`
through `onRecoverableError`. A hydration attempt no longer mutates server HTML
until it commits. Streamed boundaries keep the server fallback until the stream
swaps their content in.

## Commit-phase writes and transitions

Compiled template bindings now compute during render and write at commit. A
dropped transition never touches the DOM. An error from a value's `toString`
is a commit-phase error. Float resources (`link rel="stylesheet" precedence`,
`style href precedence`, `script async src`) reach `document.head` at commit.

Signal writes inside `startTransition` fork like `useState`. Since 0.16,
unrelated transitions commit independently, as in React 19.3: a suspended
transition no longer holds back another. Transitions that update the same
state still commit together. Optimistic updates stay until their own transition
finishes.

## Trusted Types and CSP

Octane 0.16 passes `TrustedHTML`, `TrustedScript`, and `TrustedScriptURL`
values to the DOM as objects through `dangerouslySetInnerHTML`, `srcdoc`, and
script `src`. Octane parses its own templates and streamed regions through a
policy named `octane`, and the streaming bootstrap uses `octane-stream`. A CSP
that restricts names with `trusted-types` must allow both. BTSX attributes pass
these values through unchanged.

## Compiler and bundler changes

Module directive prologues now stay ahead of generated imports. A
`module "use strong";` line compiles to a leading `"use strong";` in client and
server output, so the result can pass through a later compiler transform.

Octane 0.15 exports `Children` and `descriptorChildren` from `octane/universal`.
Vite and webpack HMR hot-update the common React export shapes. Octane 0.16
adds opt-in scoped CSS for universal renderers. Renderer config entries accept
an optional `capabilities` list, which Beast's adapter option types pass
through.

Production bundles are smaller. Vite builds size the hydrate entry to the app,
signal code ships only with the features a page uses, and the server-call
response reader loads off the critical path. None of this needs Beast
configuration. Keyed rows move with `moveBefore()` where the browser supports
it, which preserves iframes, animations, and open popovers across reorders.

## Verification

`tests/octane-0.16.test.ts` verifies leading module directives in both modes,
the protocol-3 root comment with unmarked static markup, and that a server
error inside Suspense ships a client-render range without error details.
`tests/runtime.test.ts` covers hydrating a server-rejected read into the client
ErrorBoundary fallback, and re-rendering a stored element with an array
`className` inside an `if` arm. Server, compiler, and 0.7 suites assert the new
Suspense ranges and protocol comment. Existing Rspack/Rsbuild, language-server,
and scaffold suites run against the upgraded dependencies. Parallel transition
commits, Trusted Types enforcement, `moveBefore()` reorders, and universal
scoped CSS remain upstream coverage.

Sources: [Octane 0.16.0 release](https://github.com/octanejs/octane/releases/tag/octane%400.16.0),
[0.15.0](https://github.com/octanejs/octane/releases/tag/octane%400.15.0), the
0.14.0–0.14.3 releases, and the published companion manifests.
