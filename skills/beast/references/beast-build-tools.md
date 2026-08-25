# Beast build tools

Read this reference for Beast CLI, watch mode, source maps, or Vite/Rspack/Rsbuild integration. Prefer the project's installed versions and package manager; Beast and Octane are still alpha and pin compatible peers in `beast-tsrx`.

## Choose one integration boundary

| Need | Integration |
| --- | --- |
| Standard client app or `create-beast` project | `beastOctane()` from `beast-tsrx/vite` |
| Low-level Rspack client/server compilation | `beastOctane()` from `beast-tsrx/rspack` |
| Rsbuild application routes and environments | `beastOctane()` from `beast-tsrx/rsbuild` |
| BTSX pre-transform when Octane is already installed separately | build-tool-specific `beast()` |
| Mirrored TSRX tree without an application bundler | `beast build` / `watchBeastProject()` |

Do not install both the complete `beastOctane()` adapter and a second Octane compiler plugin for the same module graph. Use the Beast-only `beast()` form only when the matching Octane integration is already configured.

## CLI

After `beast-tsrx` is installed, its `beast` binary supports:

```text
beast compile <input.btsx> [options]
beast <input.btsx> [output.tsrx] [options]
beast build [source-directory] [options] [--watch]
beast --help
```

Compile one component:

```bash
bunx beast compile src/Card.btsx \
  --output generated/Card.tsrx \
  --component-name Card \
  --props '{ title }: { title: string }'
```

| Option | Meaning | Default |
| --- | --- | --- |
| `-o`, `--output PATH` | output TSRX path | input path with `.tsrx` |
| `--component-name NAME` | generated component identifier | derived from filename |
| `--props PARAMETER` | complete function parameter and type | source `props` or empty list |
| `--no-validate` | skip Octane validation | validation enabled |

Build or watch a source tree:

```bash
bunx beast build src --out-dir .beast
bunx beast build src --out-dir .beast --watch
```

The recursive builder finds `.btsx` and native `.tsrx`, mirrors generated TSRX under the output directory, validates native TSRX in place, and writes `beast-manifest.json`. It ignores `.git`, `.beast`, `build`, `coverage`, `dist`, and `node_modules`. Stale cleanup runs only after a successful build and removes only canonical tracked `.tsrx` outputs inside the output directory.

Watch mode debounces file events, serializes rebuilds, excludes the output tree, reports compile failures without exiting, and retries after the next source change. It is intentionally long-running.

## Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { beastOctane } from "beast-tsrx/vite";

export default defineConfig({
  plugins: [
    beastOctane({
      octane: { strong: true },
    }),
  ],
});
```

Import `.btsx` and native `.tsrx` normally. Beast generates TSRX in memory before Octane. The complete adapter forwards HMR, selects server lowering during SSR transforms, and routes compiler-split `Hydrate` child queries back through the originating `.btsx` module.

`create-beast --tailwind` adds `tailwindcss()` before `beastOctane()` and places `@import "tailwindcss"` in the generated stylesheet.

## Rspack

```js
// rspack.config.mjs
import { beastOctane } from "beast-tsrx/rspack";

export default {
  entry: "./src/main.ts",
  plugins: [
    beastOctane({
      octane: { strong: true },
    }),
  ],
};
```

The adapter selects client or server output from the Rspack target, registers source dependencies for caching/watch, and resolves compiler-split `.tsrx` hydration requests back to `.btsx` while preferring a real native `.tsrx` file. `BeastRspackPlugin` and `beast()` are available when `OctaneRspackPlugin` is installed separately.

## Rsbuild

```ts
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core";
import { beastOctane } from "beast-tsrx/rsbuild";

export default defineConfig({
  plugins: beastOctane({
    octane: { strong: true },
  }),
});
```

Without Octane routes, this preserves ordinary Rsbuild entries. With `octane.config.ts`, render routes can target `.btsx` and use Octane's browser hydration and Node SSR environments. Inline options plus project Strong-mode and renderer settings are forwarded to the BTSX transform. Use Rsbuild's `beast()` alone only when `pluginOctane()` is already present.

## Source maps and programmatic builds

`compileBeastResult()` returns readable TSRX, the public AST, diagnostics, and a version 3 BTSX→TSRX source map. Continued declarations, template headers, and raw `module`/`setup`/`style` source keep fragment-level mappings to each authored physical line. Vite and Rspack compose that map through Octane (and through an earlier Rspack input map), so downstream JavaScript locations trace to original BTSX declarations, template nodes, branches, attributes, and continuation payloads.

```ts
import { buildBeastProject, compileBeastResult, watchBeastProject } from "beast-tsrx";

const compiled = compileBeastResult(source, { filename: "Card.btsx" });
console.log(compiled.code, compiled.map, compiled.diagnostics);

const build = await buildBeastProject({ root: "src", outDir: ".beast" });

const watcher = watchBeastProject({
  root: "src",
  outDir: ".beast",
  onBuild: (result) => console.log(result.generated),
  onError: (error) => console.error(error),
});

await watcher.ready;
// Later: await watcher.close();
```

Use the returned source map or downstream bundler map when diagnosing generated-code locations. Do not patch emitted TSRX or JavaScript as the source of truth.
