# __PROJECT_NAME__

A [Beast](https://www.npmjs.com/package/beast-tsrx) project powered by
[TSRX](https://tsrx.dev/) and [Octane](https://octanejs.dev/).

```bash
bun install
bun run dev
```

Edit `src/App.btsx` to get started. Declare typed props at the top of the BTSX
file; the Beast Vite plugin compiles it into native TSRX and then lets Octane
produce the browser module.

The starter pins the tested `octane@0.1.49` toolchain. Run the complete local
verification before shipping:

```bash
bun run check
```

Use `scope` when setup belongs to an exact child position instead of the whole
component:

```btsx
scope
  setup const label = "Owned by this child";
  p #{label}
```

Octane's experimental native-read signal mode remains opt-in. Enable it for
both generated BTSX and native TSRX through the Vite adapter:

```ts
beastOctane({ octane: { nativeReads: true } })
```

Record application changes in [CHANGELOG.md](CHANGELOG.md).
