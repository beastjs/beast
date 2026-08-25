# Forms and native events

Read this reference when the audit reports text-entry, checkable, select, uncontrolled, form, or synthetic-event findings.

Octane handlers receive real browser events. Preserve the source outcome while replacing assumptions that came from React's synthetic event layer.

## Event mapping

| React source contract | Octane contract | Required check |
|---|---|---|
| Text `<input onChange>` or `<textarea onChange>` for every edit | `onInput` | Type, paste, delete, autofill, and IME composition. |
| Text `onChangeCapture` for every edit | `onInputCapture` | Preserve capture ordering. |
| Intentional commit-on-blur text `onChange` | Keep native `onChange` and add `suppressNativeChangeWarning` | Blur/commit timing and save errors. |
| Checkbox/radio `onChange` | Keep native `onChange` | Pointer/keyboard activation and controlled restoration. |
| `<select onChange>` | Keep native `onChange` | Keyboard/pointer selection and reset. |
| File input `onChange` | Keep native `onChange` | File list, cancellation, and same-file reselection. |
| React synthetic `onBeforeInput` or `onSelect` assumptions | Review native browser event behavior | Browser coverage, ordering, payload, and fallback. |
| `React.ChangeEvent`, `FormEvent`, or `SyntheticEvent` type | Native event type, preferably inferred inline | `currentTarget`, cancellation, and event-specific fields. |

Do not rename every `onChange`. Component props called `onChange`, custom elements, selects, and non-text input types are not React's synthetic text-field special case.

## Text fields

Controlled `value` remains controlled in Octane. The essential change is the event:

```btsx
import { useState } from "octane";
props { initialName }: { initialName: string }
setup const [name, setName] = useState(initialName);

label(htmlFor="display-name") Display name
input#display-name(value={name} onInput={(event) => setName(event.currentTarget.value)})
```

When commit-on-blur is the actual source contract:

```btsx
props { savedDraft, save }: { savedDraft: string; save: (value: string) => void }

input(
  ~ defaultValue={savedDraft}
  ~ onChange={(event) => save(event.currentTarget.value)}
  ~ suppressNativeChangeWarning
  ~ )
```

Do not add a no-op `onInput` just to hide a warning. The suppression marks an intentional native change contract and is not emitted to HTML.

For named handlers, remove React event types. Prefer inline inference. When a named function is necessary, type it against the native event and the required `currentTarget` shape supported by the destination's Octane/DOM typings; do not retain `React.ChangeEvent` behind a cast.

## Checkbox and radio timing

Native checkables activate in browser order: cancelable `click`, then `input`, then non-cancelable `change`. React's synthetic checkable `onChange` is backed by click, so code that calls `preventDefault()` in that callback needs review.

- Keep ordinary `onChange` state updates.
- If the source rejects a toggle by cancellation, move cancellation to the earlier `onClick` contract and test it.
- Verify controlled state restoration and radio-group cousins.
- Test Space-key activation as well as pointer clicks.

## Controlled and uncontrolled controls

Inventory each control as one of:

- controlled by `value` or `checked`;
- uncontrolled with `defaultValue` or `defaultChecked`;
- native form-owned with no component state;
- library-owned through a form binding.

Do not switch categories accidentally. For uncontrolled controls, rerendering must not overwrite user edits; native or programmatic reset must restore the intended defaults. File inputs remain browser-owned.

## Complete form example

```btsx
import { useState } from "octane";
module interface PreferencesProps { onSave: (value: { name: string; subscribed: boolean; role: string }) => void }
props { onSave }: PreferencesProps
setup
  const [name, setName] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [role, setRole] = useState("reader");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    onSave({ name, subscribed, role });
  };

form(onSubmit={submit})
  label
    | Name
    input(name="name" value={name} onInput={(event) => setName(event.currentTarget.value)})
  label
    input(type="checkbox" checked={subscribed} onChange={(event) => setSubscribed(event.currentTarget.checked)})
    | Subscribe
  label
    | Role
    select(value={role} onChange={(event) => setRole(event.currentTarget.value)})
      option(value="reader") Reader
      option(value="editor") Editor
  button(type="submit") Save
```

## Actions, pending state, and reset

Octane supports `useActionState`, `useOptimistic`, `useFormStatus`, and `requestFormReset`. A React 19 form may map closely, but verify:

- whether the action is a local async function, network RPC, framework server action, or privileged server mutation;
- native validation and `preventDefault` behavior;
- serialization of `FormData`, submitter value, method, and enctype;
- authentication, authorization, CSRF, idempotency, and error transport;
- queued actions, optimistic rollback, pending accessibility, focus after errors, and reset timing.

Next.js server actions remain a server-boundary milestone. Do not turn them into client-only actions while porting a form.

## Form parity matrix

Exercise every applicable row:

- pristine, dirty, valid, invalid, disabled, read-only, pending, success, and failure;
- pointer submit and Enter submit, including multi-submit-button forms;
- typing, paste, deletion, autofill, composition, blur, and reset;
- checkbox/radio keyboard activation and cancellation;
- select keyboard/pointer changes;
- focus placement and announced status/error messages;
- hydration with prefilled or browser-restored values.

Recheck the current Octane [native event differences](https://octanejs.dev/docs/differences-from-react#events-come-from-the-browser) when the destination runtime version changes.
