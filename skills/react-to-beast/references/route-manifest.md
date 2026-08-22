# Normalized route manifest

Use the route manifest as the boundary between source-framework discovery and Beast implementation. It is a review artifact, not generated application code.

## Generate and compare

```bash
node "$REACT_TO_BEAST_SKILL_DIR/scripts/react-beast-audit.mjs" <source> --routes -
```

After a route slice exists in the Beast destination, compare both trees:

```bash
node "$REACT_TO_BEAST_SKILL_DIR/scripts/react-beast-route-compare.mjs" \
  <source> <destination>
```

Use `--json -` for a machine-readable comparison. A `matched` result means the statically inferred paths, route roles, parents, params, search keys/modes, redirect targets, and route-owned capabilities agree. It does not prove runtime parity.

## Read each route entry

Each entry records:

- source file and line, without copying source code;
- detected protocol/mode;
- source and normalized path patterns;
- index/pathless role and normalized parent;
- dynamic, optional, and splat params;
- detected search ownership/mode and literal keys, plus statically resolvable redirect targets;
- route-owned loader, action, error, pending, not-found, redirect, search, blocker, revalidation, middleware, layout, and mutation signals;
- browser/server execution status;
- candidate Octane target and review status;
- runtime checkpoints derived from those capabilities.

`inferred-review-required` means all detected models produced static entries. `partial-review-required` means at least one model or path could not be normalized safely. Resolve every `ROUTING_MANIFEST_INCOMPLETE`, `ROUTING_DYNAMIC_PATH_REVIEW`, or `ROUTING_DYNAMIC_TREE_REVIEW` finding manually.

## Preserve ownership, not only URLs

Two routes with the same path are not equivalent when a loader, action, redirect, error boundary, pending state, or layout moved to a different owner. Treat added capabilities as carefully as missing ones: moving an error boundary inward, for example, changes which layout survives a failure.

Before accepting a comparison:

1. Confirm path ranking, case sensitivity, trailing slash behavior, basename, and wildcard semantics.
2. Confirm params and search parsing/defaulting at the same route boundary.
3. Confirm loader/action execution environment and request context.
4. Confirm pending, error, not-found, redirect, revalidation, blocker, and scroll ownership.
5. Exercise every emitted checkpoint in the source and target.

The scanner is deliberately bounded and dependency-free. It follows common literal route arrays, nested `<Route>` elements, React Router framework config calls, TanStack factories, and Remix file conventions. It reports computed imports, dynamic path expressions, custom generators, and opaque route factories for manual review instead of executing source code.

## Checkpoint a large migration

Port one route family at a time. Store or review the source manifest, implement the same family in Beast, compare manifests, then pass runtime checks before changing traffic ownership. If a route remains in React, record the handoff URL, shared session/auth contract, asset base, error ownership, and rollback path. Do not call a hybrid deployment complete while ownership is implicit.
