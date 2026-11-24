# Upgrade Beast to Octane 0.23.2

Upgrade the Beast compiler and the Octane runtime together. Rebuild deployed
client and server bundles and any libraries with precompiled Octane output.

| Package | Version |
| --- | --- |
| `beast-tsrx`, `create-beast`, `octane` | `0.23.2` |
| `beast-language-server` | `0.2.6` |
| `@tsrx/oxc` | `0.24.0` |
| `@tsrx/typescript-plugin` | `0.7.15` |
| `@octanejs/rspack-plugin` / `@octanejs/rsbuild-plugin` | `0.2.15` / `0.2.6` |
| `@octanejs/base-ui` / `@octanejs/radix` | `0.1.77` / `0.1.77` |
| `@octanejs/shadcn` | `0.0.67` |
| `@octanejs/remix-router` / `@octanejs/tanstack-router` | `0.1.72` / `0.3.9` |

Existing Node compiler projects need the exact parser peer. Both
`create-beast` templates include it.

```bash
bun add --dev @tsrx/oxc@0.24.0
```

Set `tsrx.compiler` to `"octane/compiler/volar"` in `tsconfig.json` to type-check
native `.tsrx` files with `tsrx-tsc`. The starters use this configuration.

## Compiler changes

Octane 0.22 moved compiler-generated helpers from the public runtime entries
to `octane/internal/client` and `octane/internal/server`. Recompile older
output so its generated imports match the new runtime. Update hand-written
bindings that directly import helpers such as `template` or `ssr*`.

Nested BTSX `scope` setup that declares a `var` now reports `TSRX2030` at the
authored BTSX location. Use `const` or `let` for block-local values, or move
the declaration to component setup if it needs function scope. The same
TSRX rule applies directly to nested `@{ … }` and directive arms in
`.tsrx` files.

## Signals and data

Octane 0.20–0.23 add signal equality and observation policies, transactions,
keyless signals, React signal readers, and data features such as progressive
reads, cursor pagination, and colocated data handlers. Octane 0.23.2 improves
React retained-reader allocation and preserves watched subscriptions during
same-commit provider replacement. See the [Octane changelog] and the
[0.23.2 release notes] for the upstream details.

## Optional scaffold add-ons

`@beastjs/devtools@0.1.23` declares Beast and Octane peers at `^0.13.8`.
`@beastjs/page-builder@0.3.0` depends on Beast and Octane `0.13.8`.
The default scaffold and `--no-addons` use the aligned toolchain.

[Octane changelog]: https://github.com/octanejs/octane/blob/octane%400.23.2/packages/octane/CHANGELOG.md
[0.23.2 release notes]: https://github.com/octanejs/octane/releases/tag/octane%400.23.2
