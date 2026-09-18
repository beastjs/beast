# create-beast

Create a Beast, TSRX, and Octane project. The interactive setup asks for a
bundler and an Octane-native UI library.

```bash
bun create beast@latest
```

Pass a directory to skip the prompt: `bun create beast@latest my-app`.

The equivalent direct `bunx` command is:

```bash
bun x create-beast@latest my-app
```

Choose Vite, Rspack, or Rsbuild at the prompt. Choose Base UI, Radix, or shadcn
to install the corresponding `@octanejs/*` binding. You can make the same
choices non-interactively:

```bash
bun create beast@latest my-app --bundler rsbuild --ui shadcn
```

Use `--no-install`, `--no-git`, `--force`, or `--tailwind` when needed.

Add `--tailwind` to scaffold with Tailwind CSS through the selected bundler's
adapter and `@import "tailwindcss"`.
The shadcn choice enables Tailwind automatically.

Every bundler resolves `@/*` imports from `src`, matching the generated
`tsconfig.json` paths, so `.btsx`, `.tsrx`, and TypeScript modules can use
`import Card from "@/components/Card.btsx"` in Vite, Rspack, and Rsbuild projects.

Both templates pin the tested Octane version, include TSRX-aware type checking,
a production-build check, a project-owned `CHANGELOG.md`, and an interactive
`App.btsx` that exercises typed props, keyed loops, native control flow, and
scoped child setup.

Octane signals need no build option. Import `octane/signals` in a `.btsx` or
`.tsrx` module to enable native signal reads there.

Package changes are tracked in [CHANGELOG.md](CHANGELOG.md).
