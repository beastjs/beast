# Refs, context, portals, boundaries, and hydration

Read this reference when the audit reports `ref`, `context`, `portal`, `boundary`, or `hydration` signals, or any blocker in those categories.

## Refs are ordinary props

Octane does not use `forwardRef` or `createRef`.

- A function component can accept a `ref` prop directly.
- Own DOM refs with `useRef`.
- Callback refs may return cleanup.
- A host can receive an array of object and callback refs.
- Rewrite the public ref contract and every caller together; do not remove the wrapper while leaving its imperative assumptions undocumented.

Example:

```btsx
module "use strong";
import { useCallback, useMemo, useRef } from "octane";
props { label, onAttach }: { label: string; onAttach: (attached: boolean) => void }
setup
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reportInput = useCallback((element: HTMLInputElement | null) => {
    onAttach(element !== null);
    if (element !== null) return () => onAttach(false);
  }, [onAttach]);
  const refs = useMemo(() => [inputRef, reportInput], [reportInput]);

section
  label(htmlFor="search") #{label}
  input#search(ref={refs})
  button(type="button" onClick={() => inputRef.current?.focus()}) Focus
```

Stabilize a composite ref array when attach/detach churn matters. A freshly created array is a new ref value and can legitimately detach and attach its members during rerenders. Test node replacement and unmount cleanup, not only initial attachment.

For `useImperativeHandle`, accept the handle ref as a normal prop and preserve the handle's lifetime and method semantics. Do not expose a DOM node when the source exposed a narrower imperative API.

## Context ownership

`createContext`, `useContext`, and `use(context)` are supported. Preserve:

- the context object's module identity;
- its default value when no provider exists;
- the nearest-provider rule and nested providers;
- initialization order and whether a provider value is stable or recreated;
- server serialization or per-request ownership where relevant.

Context is not automatically a store. Keep frequently changing state close to its owner unless multiple branches truly need it.

```btsx
import { createContext, use } from "octane";
module
  type ThemeName = "light" | "dark";
  const Theme = createContext<ThemeName>("light");

component ThemeLabel
  setup const theme = use(Theme);
  p Theme: #{theme}

props { theme }: { theme: ThemeName }
Theme.Provider(value={theme})
  ThemeLabel
```

## Portals

Octane `createPortal` mounts into a separate DOM target while events retain logical ancestry. Verify target lifetime, capture/bubble ordering, propagation cancellation, focus trapping/restoration, layering, scroll lock, and cleanup.

```btsx
import { createPortal } from "octane";
module
  interface DialogProps { target: HTMLElement; onDismiss: () => void; onBubble: () => void }
  function PortaledDialog({ target, onDismiss }: { target: HTMLElement; onDismiss: () => void }) {
    return createPortal(DialogBody, target, { onDismiss });
  }

component DialogBody
  props { onDismiss }: { onDismiss: () => void }
  aside(role="dialog" aria-modal="true")
    button(type="button" onClick={onDismiss}) Close

props { target, onDismiss, onBubble }: DialogProps
section(onClick={onBubble})
  PortaledDialog(target={target} onDismiss={onDismiss})
```

Third-party dialog/menu/popover behavior should use a reviewed Octane binding or an independently verified implementation; markup alone does not preserve its accessibility contract.

## Suspense and error boundaries

Octane supports `Suspense`, function `ErrorBoundary`, `lazy`, and Promise reads through `use`. Beast also expresses the native boundary directly:

```btsx
import { use } from "octane";
module interface ResultProps { result: Promise<string> }

component Result
  props { result }: ResultProps
  setup const value = use(result);
  p #{value}

props { result }: ResultProps
try
  Result(result={result})
pending
  p Loading…
catch error, reset
  button(type="button" onClick={reset}) Retry: #{String(error)}
```

Map the closest boundary that owns each pending/error path. Preserve fallback delay, retained prior UI, retry/reset behavior, logging, and accessibility. A React class error boundary must become a native `try`/`catch` or function boundary; class lifecycle methods do not carry over. `SuspenseList` has no direct equivalent.

## Hydration

For server-rendered slices, test client and server compilation plus actual adoption:

- the client adopts the expected server nodes rather than replacing them;
- controlled values and browser-restored form state reconcile correctly;
- refs and effects begin after client activation, not during server rendering;
- structural mismatches and warnings are understood;
- pre-activation events replay only where the chosen hydration strategy promises it.

Octane `Hydrate` can defer an Octane-owned subtree with strategies from `octane/hydration`. It is not a generic wrapper for arbitrary React markup. Choose `load`, `idle`, `visible`, `media`, `interaction`, `condition`, or `never` based on when the existing server HTML must become interactive, then test that trigger.

## Incremental React-hosted islands

When the source remains a React 19 application during migration, `octane/react` can host a compiled Octane island inside React. This direction matters: React owns the wrapper and Octane owns the island descendants. It does not mean an unsupported React library can automatically render inside a Beast/Octane application.

Use this mode only when the migration contract explicitly retains a React host. Keep one typed island element under `OctaneCompat`, configure the compilers so React and Octane own distinct files, and test native cross-boundary events, shared context, server rendering, and hydration. React Server Components, Flight, and `cache()` do not cross this boundary.

For a standalone Beast destination, an unsupported React dependency remains a documented retained service/microfrontend boundary or blocks that slice until replaced.

For current runtime details, use Octane's [Core APIs](https://octanejs.dev/docs/core-apis) and [React compatibility](https://octanejs.dev/docs/react-compat) documentation.
