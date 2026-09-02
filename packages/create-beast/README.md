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
