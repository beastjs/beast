# Route runtime checkpoints

Static manifests constrain a port; runtime checks prove observable behavior. Run the applicable rows against source and target with the same URLs and data conditions.

| Checkpoint | Exercise | Preserve |
|---|---|---|
| Direct navigation | Open every representative URL in a fresh document/router | Match, params/search, loader ownership, status, shell, pending/error/not-found |
| In-app link | Activate links by pointer and keyboard | URL, active state, prevention rules, focus, prefetch, history action |
| Reload | Reload dynamic/search/error URLs | Same route and server/client data outcome; no dependency on visiting `/` first |
| Back/forward | Traverse several entries including redirects and mutations | Entry order, state, blockers, scroll/focus, loader/revalidation behavior |
| Params | Required, optional, decoded, malformed, and splat values | Parser, validation, ranking, typed values, 404/error behavior |
| Search | Missing/defaulted, repeated, invalid, and updated values | Parser/serializer, types, inheritance, history replace/push, loader dependencies |
| Loader | Success, pending, abort/race, empty, failure, direct request | Execution environment, request context, cache, response/status/headers, boundary |
| Action/mutation | Valid, invalid, unauthorized, duplicate, success, failure | Transport, validation, auth, optimistic/pending UI, redirect, revalidation |
| Redirect | Loader/action/client redirects and loops | Destination, replace/push, status/headers, back-stack behavior |
| Owned states | Pending, error, not-found at nested levels | Nearest owner and which parent layouts remain mounted |
| Blocker | Dirty/clean transitions, confirm/cancel/retry, unload | Lifetime, message/UX, history retry/reset |
| Scroll/focus | Link, back/forward, hash, mutation/error navigation | Saved position key, reset rules, focus target, announcements |
| SSR/hydration | Direct server render, hydrate, early interaction | Markup/status/head, serialized data, node adoption, replay, no duplicate loaders |

## Route-slice gate

A route family can take ownership only when:

1. its normalized source and target entries match or every difference is accepted;
2. all emitted route findings have a target decision;
3. its applicable runtime checkpoints pass;
4. production build and direct serving/rewrite behavior pass;
5. retained React or server boundaries have an explicit handoff and rollback.

Keep unmatched routes on the existing owner. A hybrid migration should route at a coarse, deterministic URL boundary; avoid two client routers competing for the same history/document root.
