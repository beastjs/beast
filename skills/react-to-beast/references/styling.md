# Styling migration

Tailwind is the default because the Beast starter provides a known integration and utility classes transfer cleanly when they are statically discoverable. Pure CSS remains a first-class option. Choose once for the destination shell, then allow component-level coexistence when it makes the migration safer.

## Tailwind path (default)

Scaffold with:

```bash
bun create beast@latest <destination> --tailwind --no-git
```

Use the generated Tailwind/Vite configuration as the authority for that Beast version. In the current starter this means the Tailwind Vite plugin and a stylesheet containing `@import "tailwindcss"`; do not paste an older Tailwind configuration over it.

Port in this order:

1. Retain existing global resets, fonts, tokens, and root variables that affect parity.
2. Copy complete static utility strings.
3. Convert conditional class composition without creating partial class names.
4. Move CSS Modules or global CSS incrementally where utilities would obscure behavior.
5. Remove old styling infrastructure only after no migrated component depends on it.

Tailwind and CSS may coexist. Do not delete a stylesheet simply because Tailwind is the target default.

Avoid runtime fragments such as `` `bg-${tone}-500` ``. Tailwind cannot reliably discover them. Map values to complete strings instead:

```ts
const toneClasses = {
  info: "bg-blue-500 text-white",
  warning: "bg-amber-500 text-black",
} as const;
```

If the source uses Tailwind v3 or custom plugins, inventory configuration, theme extensions, content globs, directives, and plugin behavior. Migrate to the generated version deliberately; do not assume v3 and v4 syntax or defaults are interchangeable.

## Pure-CSS path

Scaffold without the Tailwind option:

```bash
bun create beast@latest <destination> --no-git
```

Preserve the source cascade order, specificity, global selectors, font loading, custom properties, animations, media queries, and public asset paths. Imported plain CSS can usually move with the component or entry stylesheet after paths are corrected.

CSS Modules can remain explicit:

```btsx
import styles from "./Card.module.css";
props { title }: { title: string }

article(className={styles.card})
  h2(className={styles.title}) #{title}
```

Beast also supports component style blocks where that is the desired end state:

```btsx
props { title }: { title: string }

fragment
  article.card
    h2 #{title}
  style
    .card {
      padding: 1rem;
    }
```

Verify generated scoping before replacing modules or global selectors. Treat `:global`, keyframe names, custom-property inheritance, and portal content as explicit boundaries.

## Styling systems requiring a plan

Do not mechanically port runtime CSS-in-JS, Sass/Less mixins, PostCSS plugins, design-system compilers, or theme providers. Record:

- where styles execute (build, server, or browser);
- theme/context dependencies;
- SSR style extraction or insertion-order requirements;
- generated class stability;
- whether the destination will retain, replace, or temporarily isolate the system.

## Parity checks

For each migrated slice compare:

- default, hover, focus-visible, active, disabled, validation, loading, and error states;
- mobile, intermediate, and wide layouts;
- light/dark and other themes;
- typography, wrapping, overflow, and layout shift;
- reduced-motion and high-contrast behavior where present;
- focus order and visible focus treatment.

Treat screenshots as evidence, not the only test. A visually similar control can still have different keyboard or event behavior.
