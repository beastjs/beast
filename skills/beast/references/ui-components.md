# UI components — `compelling`

Project-specific reference for creating and editing Beast BTSX that consumes
`src/components/ui`. Read the component source when it disagrees with this file, and
update this catalog whenever a public prop contract changes.

The shared UI currently contains 14 BTSX components plus the sidebar navigation data.
All component children are typed as `unknown` and rendered explicitly with
`| #{children}`; these components do not use a `slot` declaration.

## Import paths

```ts
import Brand from "@/components/ui/brand.btsx"
import Button from "@/components/ui/button.btsx"
import ButtonGroup from "@/components/ui/button-group.btsx"
import Callout from "@/components/ui/callout.btsx"
import Frame from "@/components/ui/frame.btsx"
import Header from "@/components/ui/header.btsx"
import Input from "@/components/ui/input.btsx"
import List from "@/components/ui/list.btsx"
import ListItem from "@/components/ui/list-item.btsx"
import PrimaryButton from "@/components/ui/primary-button.btsx"
import Select from "@/components/ui/select.btsx"
import Switch from "@/components/ui/switch.btsx"
import Tag from "@/components/ui/tag.btsx"
import SidebarItem from "@/components/ui/sidebar/sidebar-item.btsx"
import { navGroups } from "@/components/ui/sidebar/navs"
```

Component implementations generally use `cn` from `@/lib/utils`, `Icon` and
`IconName` from `@/lib/icons`, and Octane hooks for local state. Native element
`style` props use `Octane.JSX.IntrinsicElements[...]["style"]` rather than a DOM
element property type.

## Inventory

| Component | Required props | Defaults and important behavior |
| --- | --- | --- |
| `Brand` | `imageUrl` | `imageAlt="Compelling"`; accepts `className` |
| `Button` | none | `variant="default"`, `size="md"`, `type="button"`, `iconPosition="left"` |
| `ButtonGroup` | none | horizontal, attached, default variant, medium size |
| `PrimaryButton` | none | `size="sm"`, `tone="light"`, `type="button"` |
| `Tag` | none | anchor with `href="#"`, `target="_blank"`, safe external `rel` |
| `Header` | `title` | details visible, empty actions; children render below the description |
| `Frame` | none | header renders only when `title` is present |
| `Callout` | `title`, `text` | informational surface with optional `className` |
| `Input` | none | uncontrolled text input; `placeholder="Search files..."` |
| `Select` | `items` | uncontrolled, closed, `size="sm"`, `placeholder="Select..."` |
| `Switch` | none | uncontrolled and unchecked; visible row styling is enabled by `label` |
| `List` | none | semantic `ul` with `role="list"` |
| `ListItem` | none | semantic `li`; lazy image, neutral badge, not highlighted/unread |
| `SidebarItem` | `href`, `icon`, `label`, `value`, `path`, `onNavigate` | internal navigation is intercepted; external links open in a new tab |

## Actions and navigation

### `Button`

```ts
export type ButtonVariant =
  | "default" | "primary" | "secondary" | "outline" | "ghost" | "mist"
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon"

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  disabled?: boolean
  type?: "button" | "submit" | "reset"
  icon?: IconName
  iconPosition?: "left" | "right"
  onClick?: (event: MouseEvent) => void
  label?: string | number
  style?: Octane.JSX.IntrinsicElements["button"]["style"]
  "aria-label"?: string
  children?: unknown
}
```

Use `size="icon"` with an accessible label. The icon is 12 px for `xs`, 14 px for
`sm`/`md`/`lg`, and 16 px for `icon`.

```btsx
Button(variant="outline" size="sm" icon="eraser" label="Clear" onClick={clear})
Button(variant="ghost" size="icon" icon="theme" aria-label="Toggle theme" onClick={toggleTheme})
```

### `PrimaryButton`

```ts
export interface PrimaryButtonProps {
  size?: "sm" | "lg"
  tone?: "light" | "dark"
  type?: "button" | "submit" | "reset"
  disabled?: boolean
  label?: string | number
  icon?: IconName
  iconPosition?: "left" | "right"
  className?: string
  style?: Octane.JSX.IntrinsicElements["button"]["style"]
  onClick?: (event: MouseEvent) => void
  "aria-label"?: string
  "aria-pressed"?: boolean
  children?: unknown
}
```

This is always a native `button`. It does not accept `href`, `target`, or `rel`; use
`Tag` or a styled anchor for navigation.

```btsx
PrimaryButton(size="lg" tone="dark" label="Add to cart" onClick={addToCart})
```

### `Tag`

```ts
export interface TagProps {
  href?: string
  target?: "_blank" | "_self" | "_parent" | "_top"
  rel?: string
  variant?: "default" | "primary" | "secondary" | "outline" | "ghost" | "mist"
  size?: "sm" | "md" | "lg"
  className?: string
  icon?: IconName
  iconPosition?: "left" | "right"
  label?: string
  onClick?: (event: MouseEvent) => void
  onRemove?: (event: MouseEvent) => void
  style?: Octane.JSX.IntrinsicElements["a"]["style"]
  children?: unknown
}
```

`Tag` always renders an anchor. Set `target="_self"` for internal navigation. When
`onRemove` is supplied, its nested remove button prevents navigation and stops event
propagation before calling the handler.

```btsx
Tag(href="/guides" target="_self" variant="secondary" label="Guides")
Tag(label="Beast" icon="mechanics" onRemove={removeTag})
```

### `ButtonGroup`

```ts
export interface ButtonGroupProps {
  orientation?: "horizontal" | "vertical"
  attached?: boolean
  variant?: "default" | "segmented"
  size?: "sm" | "md" | "lg"
  className?: string
  children?: unknown
}
```

`attached=true` applies shared borders, dividers, and first/last radii to direct
children. `variant="segmented"` supplies its own rounded muted container. Size is
applied to direct children.

```btsx
ButtonGroup(size="sm" attached={false})
  Button(label="Undo" onClick={undo})
  Button(label="Redo" onClick={redo})
```

Do not pass `attached` to `Button` or `Tag`; it belongs to `ButtonGroup`.

## Surfaces and page chrome

### `Header`

```ts
export interface HeaderAction {
  id: string
  label?: string
  icon?: IconName
  href?: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  onClick?: (event: MouseEvent) => void
}

export interface HeaderProps {
  title: string
  subtitle?: string
  description?: string
  icon?: IconName
  isVisible?: boolean
  toggleFn?: VoidFunction
  pending?: boolean
  pendingLabel?: string
  actions?: readonly HeaderAction[]
  className?: string
  actionsClassName?: string
  children?: unknown
}
```

Action rendering is selected in this order:

1. `href` renders an anchor; absolute HTTP links open in a new tab.
2. `onClick` renders `Button` and honors `variant` and `size`.
3. An action with neither renders a non-interactive fallback `div`.

The details toggle appears only when `toggleFn` is present. `isVisible` controls the
description and the toggle's `aria-expanded`; `icon` is the toggle icon and defaults
to `overview`. `pending=false` intentionally renders a “Saved” status.

```btsx
Header(
  ~ title="Adaptive Form"
  ~ subtitle="Validation streams"
  ~ description="Cancellation-safe async validation."
  ~ isVisible={showInfo}
  ~ toggleFn={toggleInfo}
  ~ pending={saving}
  ~ actions={[{ id: "reset", label: "Reset", onClick: reset, variant: "outline" }]}
  ~ )
```

### `Frame`, `Callout`, and `Brand`

```ts
export interface FrameProps {
  title?: string
  subtitle?: string
  className?: string
  children?: unknown
}

export interface CalloutProps {
  title: string
  text: string
  className?: string
}

export interface BrandProps {
  imageUrl: string
  imageAlt?: string
  className?: string
}
```

`Frame` renders `subtitle` only inside a header created by `title`. Its children are
wrapped in a full-width content `div`. `Brand` currently renders the product lockup
text “Beast / Demo / Beast” beside the supplied image.

```btsx
Frame(title="Results" subtitle={`${count} items`})
  Results(data={items})
Callout(title="Tip" text="Use stable keys for streamed results.")
Brand(imageUrl={logoUrl} imageAlt="Beast Demo")
```

## Form controls

### `Input`

```ts
export interface InputProps {
  value?: string
  defaultValue?: string
  placeholder?: string
  type?: string
  disabled?: boolean
  leftIcon?: IconName
  rightSlot?: unknown
  className?: string
  inputClassName?: string
  onChange?: (value: string) => void
  onKeyDown?: (event: KeyboardEvent) => void
  children?: unknown
}
```

`value !== undefined` selects controlled mode; otherwise local state starts from
`defaultValue ?? ""`. `onChange` receives the next string, not an input event.
`className` styles the wrapper and `inputClassName` styles the native input. A search
input always shows the `/` keyboard hint; `rightSlot` and children render after it.

```btsx
Input(type="search" value={query} leftIcon="search" onChange={setQuery})
Input(type="password" value={password} onChange={setPassword} onKeyDown={handleKeyDown})
```

### `Select`

```ts
export interface SelectItem {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  value?: string
  size?: "sm" | "lg"
  defaultValue?: string
  placeholder?: string
  label?: string
  disabled?: boolean
  items: readonly SelectItem[]
  onValueChange?: (value: string) => void
  className?: string
  triggerClassName?: string
  contentClassName?: string
}
```

`Select` is a custom listbox. It supports controlled and uncontrolled values, closes
after selection, on outside `mousedown`, and on Escape, and skips disabled items.
`className` styles the root; trigger and popup styling have separate override props.

```btsx
Select(label="Plan" size="lg" items={planItems} value={plan} onValueChange={setPlan})
```

### `Switch`

```ts
export interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  required?: boolean
  id?: string
  name?: string
  value?: string
  label?: string
  className?: string
  labelClassName?: string
  controlClassName?: string
  thumbClassName?: string
  onCheckedChange?: (checked: boolean) => void
  "aria-label"?: string
  "aria-describedby"?: string
}
```

`checked !== undefined` selects controlled mode. The component renders a real
checkbox with `role="switch"`; the surrounding label controls it. Providing `label`
also adds the full-width settings-row layout. Supply `aria-label` when omitting the
visible label.

```btsx
Switch(label="Email notifications" checked={enabled} onCheckedChange={setEnabled})
Switch(defaultChecked={true} aria-label="Enable preview")
```

## Lists

### `List`

```ts
export interface ListProps {
  id?: string
  className?: string
  style?: Octane.JSX.IntrinsicElements["ul"]["style"]
  "aria-label"?: string
  "aria-labelledby"?: string
  children?: unknown
}
```

### `ListItem`

```ts
export interface ListItemProps {
  id?: string
  title?: string
  timestamp?: string
  dateTime?: string
  subtitle?: string
  description?: string
  imageSrc?: string
  imageAlt?: string
  imageLoading?: "eager" | "lazy"
  media?: unknown
  badge?: unknown
  badgeIcon?: IconName
  badgeTone?: "neutral" | "violet" | "amber" | "green" | "coral" | "blue"
  unread?: boolean
  highlighted?: boolean
  actions?: unknown
  className?: string
  mediaClassName?: string
  badgeClassName?: string
  contentClassName?: string
  style?: Octane.JSX.IntrinsicElements["li"]["style"]
  "aria-label"?: string
  children?: unknown
}
```

`media` takes precedence over `imageSrc`. A badge renders only when media or an image
also renders. `badge` takes precedence over `badgeIcon`. `timestamp` uses `dateTime`
on its native `time` element. Children appear after the description; `actions` render
last in their own flex row.

```btsx
List(aria-label="Customer reviews")
  each review in reviews key review.id
    ListItem(
      ~ title={review.author}
      ~ timestamp={review.date}
      ~ description={review.text}
      ~ imageSrc={review.avatar}
      ~ imageAlt={review.author}
      ~ badge={review.verified ? "✓" : undefined}
      ~ badgeTone="green"
      ~ unread={!review.seen}
      ~ )
```

## Sidebar

```ts
export interface SidebarItemProps {
  href: string
  icon: IconName
  label: string
  value: string | number
  path: string
  onNavigate: (event: MouseEvent) => void
}
```

`path === href` marks the item current. Internal links prevent the browser default and
call `onNavigate(event)`; external HTTP links open directly in a new tab and do not
call it. `value` remains required by the interface, although its visual output is
currently commented out.

`sidebar/navs.ts` exports `NavItem`, `NavGroup`, and mutable `navGroups: NavGroup[]`.
Every `NavItem` contains `href`, `icon`, `label`, `description`, `title`, `value`, and
`tags`.

```btsx
each item in group.items key item.href
  SidebarItem(
    ~ href={item.href}
    ~ icon={item.icon}
    ~ label={item.label}
    ~ value={item.value}
    ~ path={path}
    ~ onNavigate={navigate(item.href)}
    ~ )
```

## Authoring rules

- Import components directly from their `.btsx` files; there is no UI barrel export.
- Use exported union types when another component exposes a compatible prop, as
  `HeaderAction` does for button variants and sizes.
- Use the callback payload each component declares: `MouseEvent` for action controls,
  `string` for `Input`/`Select`, and `boolean` for `Switch`.
- Keep controlled and uncontrolled modes distinct. Do not pass both `value` and
  `defaultValue`, or both `checked` and `defaultChecked`.
- Pass content through indented children. These implementations explicitly render
  `children?: unknown` with `| #{children}`.
- Use `className` for the outer element and the component-specific override prop for
  an inner control (`inputClassName`, `triggerClassName`, `contentClassName`, and so
  on).
- Do not invent passthrough props. In particular, `PrimaryButton` has no link props,
  and `attached` exists only on `ButtonGroup`.
- Preserve accessible names for icon-only buttons, unlabeled switches, and lists.

## Composed example

```btsx
import Button from "@/components/ui/button.btsx"
import ButtonGroup from "@/components/ui/button-group.btsx"
import Frame from "@/components/ui/frame.btsx"
import Header from "@/components/ui/header.btsx"
import Input from "@/components/ui/input.btsx"
import Select from "@/components/ui/select.btsx"
import Switch from "@/components/ui/switch.btsx"
import { useState } from "octane"

module
  interface Props {
    plans: readonly { value: string; label: string; disabled?: boolean }[]
    onApply?: (filters: { query: string; plan: string; enabled: boolean }) => void
  }

props { plans, onApply }: Props

setup
  const [query, setQuery] = useState("")
  const [plan, setPlan] = useState("")
  const [enabled, setEnabled] = useState(false)
  const reset = () => { setQuery(""); setPlan(""); setEnabled(false) }
  const apply = () => onApply?.({ query, plan, enabled })

main
  Header(title="Accounts" subtitle="Workspace settings")
  Frame(title="Filters" subtitle={plan || "All plans"})
    div(className="grid gap-3 p-4")
      Input(type="search" value={query} leftIcon="search" onChange={setQuery})
      Select(items={plans} value={plan} onValueChange={setPlan})
      Switch(label="Enabled only" checked={enabled} onCheckedChange={setEnabled})
      ButtonGroup(size="sm" attached={false})
        Button(label="Reset" variant="outline" onClick={reset})
        Button(label="Apply" variant="primary" onClick={apply})
```
