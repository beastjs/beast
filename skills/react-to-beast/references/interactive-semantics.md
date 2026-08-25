# Interactive semantics

Read this reference when the audit reports interactive files, hook usage, lifecycle findings, or an interactive state matrix. The goal is behavioral parity under Octane, not merely changing imports from `react` to `octane`.

## Start from the generated evidence

Run both views:

```bash
node "$REACT_TO_BEAST_SKILL_DIR/scripts/react-beast-audit.mjs" <source> --json -
node "$REACT_TO_BEAST_SKILL_DIR/scripts/react-beast-audit.mjs" <source> --matrix -
```

Confirm every source-located finding in the file. The audit is static and intentionally conservative. Use the matrix to define tests for the first dependency-safe slice; add application-specific states that static analysis cannot infer.

## Hook compatibility contract

| React surface | Octane migration |
|---|---|
| `useState`, functional setters | Direct. Preserve immutable updates and snapshot semantics. Octane optionally adds a third latest-state getter. |
| `useReducer` | Direct. Preserve reducer, initializer, and two-item tuple; use the optional third getter only for a proven delayed-read need. |
| `useEffect` | Direct for external synchronization. Preserve cleanup and dependency behavior explicitly. |
| `useLayoutEffect` | Direct when work must occur before paint; do not promote ordinary effects. |
| `useInsertionEffect` | Direct for styling infrastructure, after verifying style ordering and SSR. |
| `useMemo`, `useCallback`, `memo` | Supported. Preserve identity/recomputation boundaries when callers rely on them. |
| `useRef` | Direct for DOM nodes, timers, and other non-render state. Strong mode rejects writes during render. |
| `useImperativeHandle` | Supported with an ordinary `ref` prop; `forwardRef` is not used. |
| `createContext`, `useContext`, `use(context)` | Supported. Preserve fallback values and provider ownership. |
| `useSyncExternalStore` | Supported. Keep subscription/snapshot functions stable and supply a deterministic server snapshot for SSR/hydration. |
| `useTransition`, `startTransition`, `useDeferredValue` | Supported without CPU time slicing. Keep text-entry state urgent. |
| `useActionState`, `useOptimistic`, `useFormStatus` | Supported. Revalidate form transport, pending/error behavior, and reset semantics. |
| `lazy`, `Suspense`, function `ErrorBoundary` | Supported. Beast can also express native `try`/`pending`/`catch`. |
| `forwardRef`, `createRef`, classes, class error boundaries | Rewrite boundary. Do not replace by search-and-replace. |
| `StrictMode`, `Profiler`, `SuspenseList`, legacy roots | No direct equivalent. Identify the actual lifecycle, measurement, ordering, or mounting contract first. |

## Dependency arguments are a semantic trap

React and Octane differ when the dependency argument is omitted:

- React `useEffect(callback)` runs after every render. Octane derives dependencies from captures.
- React `useMemo(factory)` and `useCallback(callback)` without a dependency array recreate/recompute every render. Octane derives dependencies.
- Explicit React arrays retain their meaning in Octane.
- In Octane, pass `null` only when every-render behavior is intentional and required for parity.

Therefore preserve `[]` and explicit arrays during the first port. For an omitted React dependency argument, choose `null` for exact every-render parity or select an explicit dependency list after proving that the behavior change is safe. The audit reports `INTERACTIVE_OMITTED_DEPENDENCY_SEMANTICS` at these call sites.

Do not remove arrays merely because Octane can infer them. That is an optimization/refactor after parity, not part of the mechanical port.

## State ownership

- Derive values during render instead of adding an effect that mirrors props or state.
- Put interaction-caused work in the event handler.
- Use `useLinkedState(source, initializer)` when editable local state must reset or reconcile as a source identity changes. Verify the reset boundary; do not substitute it for every prop-derived state pattern.
- Use functional state updates when the next value depends on the previous value.
- Do not mutate state objects or arrays in place.
- Keep a third state getter for genuinely delayed or async reads, not ordinary rendering.

Example:

```btsx
module "use strong";
import { useEffect, useLinkedState, useRef } from "octane";
props { user, onSave }: { user: { id: string; name: string }; onSave: (name: string) => void }
setup
  const [name, setName] = useLinkedState(user.id, () => user.name);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key === "/") inputRef.current?.focus();
    };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, []);

form(onSubmit={(event) => { event.preventDefault(); onSave(name); }})
  label(htmlFor="profile-name") Name
  input#profile-name(ref={inputRef} value={name} onInput={(event) => setName(event.currentTarget.value)})
  button(type="submit") Save
```

## Effects and external ownership

For each effect, record the external system it owns and when ownership begins/ends. A valid port answers:

- what creates the subscription, timer, observer, connection, request, or DOM integration;
- which captures should reconnect it;
- what cleanup runs on dependency change and unmount;
- whether async work needs cancellation or stale-result protection;
- whether it must run before paint, after paint, or never on the server;
- what replaces any reliance on StrictMode's development double invocation.

An effect that only derives state or reacts to a click should usually become a render expression or event handler. An effect that owns an external resource must retain cleanup.

## Hook placement

Keep valid React hook topology during the first port. Octane tracks hooks by source location and can support conditional hooks, but exploiting that difference while migrating makes parity harder to prove. Never put a slot-based hook in a plain JavaScript loop; use a keyed Beast `each`/Octane `@for` boundary or extract a child component.

## Strong mode

After a component compiles, enable `module "use strong";` for the slice when practical. It catches render-time state updates, synchronous setup-time effect updates, render-time ref writes, and analyzable Effect Event misuse. Strong mode is a verification aid, not permission to redesign lifecycle behavior during the port.

## Exit gate for an interactive slice

- All audit blockers in the slice have an explicit rewrite or retained boundary.
- Every generated state-matrix row has an executable test or documented manual check.
- Effect cleanup, keyboard behavior, focus, controlled inputs, pending/error states, and provider updates are exercised where present.
- Client and server compilation pass; hydration is tested when server HTML exists.
- The destination's development transform and production build pass.
- Any deliberate semantic improvement is listed separately from parity changes.

When the destination uses a different Octane version than the generated Beast project, recheck the current [Core APIs](https://octanejs.dev/docs/core-apis) and [Differences from React](https://octanejs.dev/docs/differences-from-react) before applying these mappings.
