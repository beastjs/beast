# Beast BTSX syntax cheatsheet

Use this reference when authoring or reviewing `.btsx`. Beast turns indentation into native TSRX; Octane remains the runtime and final TypeScript/TSRX validator.

## File shape and declarations

Declarations must appear before the first template node. `module` and `setup` accept either one inline statement or an indented raw-source block. Imports and `props` occupy one logical line, which may span physical lines through `~`; a trailing semicolon is optional.

```btsx
module
  "use strong";
  interface Props {
    title: string;
    items: { id: string; label: string }[];
  }

import { useMemo, useState } from "octane";

component ItemCount
  props { value }: { value: number }
  p Count: #{value}

props { title, items }: Props
setup
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const count = useMemo(() => items.length);

main.page
  h1 #{title}
  ItemCount(value={count})
```

Use a module directive before imports when native TSRX requires it. `module` and `setup` source is preserved as TypeScript; Beast removes the block's common indentation but does not parse or rewrite it. A `props` declaration contains the component's complete function parameter, including its type. Explicit compiler or bundler `propsParam` options override source-level props.

## Elements and selectors

| BTSX | Meaning |
| --- | --- |
| `section` | native element |
| `.card` | `div` with class `card` |
| `section.hero` | element plus class shorthand |
| `section#intro.hero` | element with ID and class shorthand |
| `Card` | component reference |
| `Theme.Provider` | dotted component API |
| `Card.featured` | component plus class shorthand |

Capitalized selectors are component references. After a capitalized selector, PascalCase and `_`/`$` dotted segments remain part of the component API; a lowercase dotted segment is class shorthand.

Indentation defines children:

```btsx
main.page
  section#intro.hero
    h1 Beast
    p Indentation becomes structure.
```

Indentation must use spaces. Two spaces is the project convention, but the parser's semantic requirement is that siblings align and children are indented more deeply than their parent. Tabs in indentation fail with `BEAST1003_TAB_INDENT`.

## Attributes

Attributes live in parentheses and can be separated by spaces or commas:

```btsx
Button(tone="primary" count={items.length} disabled) Continue
a.link(href={url} target="_blank" rel="noreferrer") Open
article.card({...cardProps} data-id={id}) #{title}
```

| Form | Behavior |
| --- | --- |
| `name="value"` or `name='value'` | quoted string |
| `name={expression}` | TypeScript expression |
| `disabled` | boolean attribute |
| `{...props}` | ordered TypeScript spread |

`class` normalizes to `className`. Selector classes combine with one explicit `class` or `className`. ID shorthand cannot be combined with an explicit `id`, and duplicate explicit class attributes are rejected. Spreads keep their authored order, so normal TSRX precedence applies.

## Text, interpolation, entities, and comments

Inline text follows a selector. Prefix a child line with `|` when it must be text rather than an element selector:

```btsx
p Hello, #{user.name}. You have #{messages.length} messages.
div.notice
  | This line is text, not an element selector.
| Symbols stay safe: &lt; &gt; { } &amp;.
```

`#{...}` embeds a TypeScript expression. Literal text and quoted string attributes decode HTML entities before code generation; expressions remain untouched. Beast emits quote-safe attributes and safe literal text for Octane.

Use `//` for comments:

```btsx
// This line is omitted from generated TSRX.
p Visible
```

Do not use `#` as a comment prefix. It belongs to selector ID shorthand and `#{...}` interpolation.

## Native control flow

```btsx
if status === "ready"
  ReadyView
elseif status === "loading"
  LoadingView
else
  ErrorView

each item, index in items key item.id
  Row(item={item} position={index})
empty
  p No matches.

switch variant
  case "editor"
    Editor
  case "viewer"
    Viewer
  default
    Empty

try
  Profile(data={profileData})
pending
  p Loading profile…
catch error, reset
  .error
    p Could not load profile: #{String(error)}
    button(type="button" onClick={reset}) Try again
```

- `if`/`elseif`/`else` branches must be adjacent and aligned.
- `each item[, index] in iterable [key expression]` emits `@for`. Beast never invents an index key. A `key={...}` on the loop's only root can be hoisted instead of a header key.
- `empty` must immediately follow its `each` at the same indentation.
- `case` and `default` are direct children of `switch`; a switch has at most one default.
- `try` requires `pending`, `catch`, or both. When both exist, `pending` comes first. Catch bindings can be bare (`catch error, reset`) or parenthesized.

## Fragments, roots, and styles

```btsx
fragment
  Header
  main Content

style
  .card {
    padding: 1rem;
  }

  :global(body) {
    margin: 0;
  }
```

An authored `fragment` always emits a native TSRX fragment. Beast also inserts a fragment for multiple roots, no roots, a text-only root, or a style-only root. A `style` body is raw CSS with common indentation removed; Octane scopes it, while `:global(...)` escapes scoping.

## Continuation lines (`~`)

Prefix a more deeply indented physical line with `~` to append its payload to the preceding authored line. Beast joins the trimmed payload with one space before parsing or preserving the surrounding raw-source block:

```btsx
setup const total = value
  ~ + fallback;

Button(
  ~ tone="primary"
  ~ disabled
  ~ onClick={() => save()}
  ~ ) Save

if isReady
  ~ && hasPermission
  p Ready

each item in items
  ~ key item.id
  li #{item.label}

| Long literal text that
  ~ continues on the next physical line

style
  .continued {
    ~ color: red;
    ~ }
```

Rules:

- `~` must be the first non-space character on its physical line.
- It must be indented more deeply than the authored line it extends.
- Spaces or tabs immediately after `~` are removed, and the remaining payload is trimmed at the end.
- `~` with no payload, or `~ // comment`, is a no-op continuation.
- Multiple continuation lines chain onto the same predecessor.
- An initial/orphan continuation fails with `BEAST1004_ORPHAN_CONTINUATION`.
- Template headers, pipe text, continued imports/props, inline declarations, and lines inside raw `module`, `setup`, and `style` blocks can all use continuations.
- Generated segments from a continuation retain that physical line and column in Beast's source map; combined declaration/node spans can cross the authored fragments.

## Compiled TSRX shape

```btsx
props { title, items }: Props
main.app
  h1 #{title}
  each item in items key item.id
    a.button(href={item.url}) #{item.label}
```

```tsrx
export default function App({ title, items }: Props) @{
	<main className="app">
		<h1>{title}</h1>
		@for (const item of items; key item.id) {
			<a className="button" href={item.url}>{item.label}</a>
		}
	</main>
}
```

Generated TSRX stays readable. Fix the BTSX source when either Beast or Octane reports an error.

## Common gotchas

- declarations after template content → `BEAST1503_MISPLACED_DECLARATION`
- tabs in indentation → `BEAST1003_TAB_INDENT`
- empty `fragment`, `style`, control-flow arm, or local component template → source-located error
- spread syntax must be `{...value}`, not `{value}`
- `component Name` requires one PascalCase TypeScript identifier
- an unclosed attribute list or interpolation cannot be repaired by indentation; close the delimiter or use `~` to continue the logical line
