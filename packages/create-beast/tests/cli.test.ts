import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function run(args: string[]) {
  const cwd = await mkdtemp(resolve(tmpdir(), "beast-cli-test-"));
  directories.push(cwd);
  const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "../src/index.ts"), ...args], {
    cwd, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr, cwd };
}

test("noninteractive defaults stay small and add-on free", async () => {
  const result = await run(["--yes", "--no-install", "--no-git"]);
  expect(result.code).toBe(0);
  expect(result.stdout).not.toContain("\x1b[");
  const manifest = await Bun.file(resolve(result.cwd, "beast-app/package.json")).json();
  expect(manifest.devDependencies["@beastjs/cli"]).toBeUndefined();
  expect(manifest.devDependencies["@beastjs/devtools"]).toBeUndefined();
  expect(result.stdout).toContain("bun install\n  bun run dev");
});

test("all tool flags work with inline stack options and deferred setup", async () => {
  const result = await run([
    "my app", "--bundler=rsbuild", "--ui=radix", "--beast-ui", "--icons",
    "--devtools", "--page-builder", "-y", "--no-install", "--no-git",
  ]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("cd 'my app'");
  expect(result.stdout).toContain("bun run beast-ui init --package-manager bun");
  expect(result.stdout).toContain("bun run beast-ui icons init --framework beast");
  expect(result.stdout).toContain("rsbuild · radix · Devtools · Page Builder · Beast UI · icons");
});

for (const bundler of ["vite", "rspack", "rsbuild"] as const) {
  for (const [label, flags, devtools, pageBuilder] of [
    ["Devtools", ["--devtools"], true, false],
    ["Page Builder", ["--page-builder"], false, true],
    ["both development tools", ["--devtools", "--page-builder"], true, true],
  ] as const) {
    test(`CLI registers ${label} in the selected ${bundler} configuration`, async () => {
      const result = await run([
        "app", "--bundler", bundler, ...flags, "--yes", "--no-install", "--no-git",
      ]);
      expect(result.code).toBe(0);
      const directory = resolve(result.cwd, "app");
      const config = await Bun.file(resolve(directory, `${bundler}.config.ts`)).text();
      const manifest = await Bun.file(resolve(directory, "package.json")).json();
      for (const [enabled, name, factory] of [
        [devtools, "devtools", "beastDevtools"],
        [pageBuilder, "page-builder", "beastPageBuilder"],
      ] as const) {
        if (enabled) {
          expect(manifest.devDependencies[`@beastjs/${name}`]).toBeDefined();
          expect(config).toContain(`import { ${factory} } from "@beastjs/${name}/${bundler}";`);
          expect(config).toContain(`${factory}()`);
        } else {
          expect(manifest.devDependencies[`@beastjs/${name}`]).toBeUndefined();
          expect(config).not.toContain(factory);
        }
      }
      if (devtools) {
        expect(config).toContain(bundler === "vite"
          ? 'profile: "auto"'
          : 'profile: process.env.NODE_ENV !== "production"');
      } else {
        expect(config).not.toContain("profile:");
      }
      expect(config).toContain(bundler === "rsbuild" ? "...beastOctane(" : "beastOctane(");
      for (const other of ["vite", "rspack", "rsbuild"].filter((name) => name !== bundler)) {
        expect(await Bun.file(resolve(directory, `${other}.config.ts`)).exists()).toBe(false);
      }
    });
  }
}

test("invalid choices and contradictory options fail before writing files", async () => {
  for (const args of [["--bundler", "webpack"], ["--no-addons", "--icons"], ["--ui="], ["--unknown"]]) {
    const result = await run(args);
    expect(result.code).toBe(1);
    expect(await Bun.file(resolve(result.cwd, "beast-app/package.json")).exists()).toBe(false);
    expect(result.stderr.trim()).not.toBe("");
  }
});

test("help includes optional tools and the automation path", async () => {
  const result = await run(["--help"]);
  expect(result.code).toBe(0);
  for (const flag of ["--devtools", "--page-builder", "--beast-ui", "--icons", "--yes"]) {
    expect(result.stdout).toContain(flag);
  }
  expect(await Bun.file(resolve(result.cwd, "beast-app/package.json")).exists()).toBe(false);
});

test("the project API can be imported from a stdin script", async () => {
  const source = `import { createProject } from ${JSON.stringify(resolve(import.meta.dir, "../src/index.ts"))}; console.log(typeof createProject);`;
  const child = Bun.spawn([process.execPath, "-"], {
    stdin: new Blob([source]), stdout: "pipe", stderr: "pipe",
  });
  expect(await child.exited).toBe(0);
  expect(await new Response(child.stdout).text()).toBe("function\n");
});
