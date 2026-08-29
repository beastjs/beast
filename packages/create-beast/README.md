# create-beast

Create a Beast, TSRX, Octane, and Vite project.

```bash
bun create beast@latest
```

Pass a directory to skip the prompt: `bun create beast@latest my-app`.

The equivalent direct `bunx` command is:

```bash
bun x create-beast@latest my-app
```

Use `--no-install`, `--no-git`, `--force`, or `--tailwind` when needed.

Add `--tailwind` to scaffold with Tailwind CSS via `@tailwindcss/vite` + `@import "tailwindcss"`.

Both templates pin the tested Octane version, include TSRX-aware type checking,
a production-build check, a project-owned `CHANGELOG.md`, and an interactive
`App.btsx` that exercises typed props, keyed loops, native control flow, and
scoped child setup.

The experimental Octane signal engine is not enabled by default. Generated
projects can opt in by passing `octane: { nativeReads: true }` to
`beastOctane()` in `vite.config.ts`.

Package changes are tracked in [CHANGELOG.md](CHANGELOG.md).
