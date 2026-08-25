# Component porting

Use this guide after the audit identifies a foundation-safe slice. Keep the React component beside the port until its states and callers have been verified.

## Foundation-safe criteria

A component is a good first slice when it:

- renders from props and local pure expressions;
- uses ordinary HTML, other already-ported components, and static assets;
- has no router, server-only, context, ref, portal, suspense, or third-party React runtime dependency;
- has styling whose cascade, scoping, and asset paths can be reproduced;
- can be exercised through a small, explicit state matrix.

Move shared types and pure utilities first. Preserve exported names and prop shapes where that reduces caller churn, but do not import React types solely to keep an obsolete React contract.

## Basic conversion

React source:

```tsx
import type { Product } from "./types";

interface ProductCardProps {
  product: Product;
  featured?: boolean;
}

export default function ProductCard({ product, featured = false }: ProductCardProps) {
  const label = featured ? "Featured" : "Product";

  return (
    <article className="product-card" data-featured={featured || undefined}>
      <p className="eyebrow">{label}</p>
      <h2>{product.name}</h2>
      <a href={`/products/${product.id}`}>View product</a>
    </article>
  );
}
```

Beast source:

```btsx
import type { Product } from "./types";
module
  interface ProductCardProps {
    product: Product;
    featured?: boolean;
  }
props { product, featured = false }: ProductCardProps
setup const label = featured ? "Featured" : "Product";

article.product-card(data-featured={featured || undefined})
  p.eyebrow #{label}
  h2 #{product.name}
  a(href={`/products/${product.id}`}) View product
```

The default export is produced by the Beast component module. Do not wrap BTSX in a React function or add a JSX `return`.

## Mechanical mappings

| React/JSX | Beast BTSX |
|---|---|
| Function parameter destructuring | `props { ... }: PropsType` |
| Local statements before `return` | `setup ...` or an indented `setup` block |
| `<section className="card">` | `section.card` |
| `<Widget value={value} />` | `Widget(value={value})` |
| `{value}` in text | `#{value}` |
| `{condition && <Item />}` | `if condition` followed by an indented `Item` |
| `items.map(...)` | `each item, index in items`, preferably with a stable `key` |
| `<>...</>` | `fragment` |
| Spread attributes | `Element({...attributes})` |

Do not mechanically change every `className` to `class`. Both spellings can be meaningful to generated/runtime behavior and bindings; follow the generated Beast template and verify the compiled output.

## Conditions and lists

```btsx
props { products, selectedId }: { products: { id: string; name: string }[]; selectedId: string | null }

section(aria-label="Products")
  if selectedId
    p Selection: #{selectedId}
  else
    p Choose a product
  ul
    each product in products key product.id
      li
        a(href={`/products/${product.id}`}) #{product.name}
    empty
      li No products available
```

Preserve React keys conceptually. Prefer stable domain identifiers over indexes. Verify empty branches because a React expression that produced `null`, `false`, or an empty array may need an explicit Beast branch.

## Attributes and children

- Keep accessibility attributes, form names, labels, `data-*`, and `aria-*` values intact.
- Preserve boolean versus string attribute semantics. Do not turn `disabled={false}` into a present `disabled` attribute.
- Keep trusted/untrusted HTML boundaries explicit. Do not translate `dangerouslySetInnerHTML` without reviewing sanitization.
- Port children contracts deliberately. A React component that clones, filters, or inspects children is not a basic presentational component.
- Verify asset URLs relative to the destination bundler and public directory.

## Route interactive boundaries

- **State and effects:** read [interactive-semantics.md](interactive-semantics.md) and implement the generated matrix.
- **Inputs and forms:** read [forms-and-events.md](forms-and-events.md); text per-edit handling commonly moves from React `onChange` to native `onInput`.
- **Refs, context, portals, boundaries, hydration:** read [refs-context-boundaries.md](refs-context-boundaries.md).
- **Third-party components and hooks:** read [bindings.md](bindings.md) and verify the exact used surface.
- **Server components:** keep server data and secrets on the server; never make a component client-side merely to simplify a port.

For an unsupported dependency, choose one explicit path: replace it with a native/Octane implementation, retain a separately owned boundary, use an Octane island inside a deliberately retained React 19 host, or defer that slice. `octane/react` does not automatically make a React package runnable inside a standalone Beast app. Record the choice and its removal condition.
