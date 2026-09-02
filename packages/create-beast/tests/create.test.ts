import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createProject } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "create-beast-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("create-beast", () => {
  test("creates a complete project without installing or initializing Git", async () => {
    const cwd = await temporaryDirectory();
    const result = await createProject({
      cwd,
      directory: "My Beast App",
      install: false,
      git: false,
      compilerSpec: "file:/local/beast-tsrx.tgz",
    });

    expect(result.packageName).toBe("my-beast-app");
    expect(result.installed).toBe(false);
    expect(result.gitInitialized).toBe(false);
    expect(result.bundler).toBe("vite");
    expect(result.ui).toBe("base-ui");
    expect(await readFile(resolve(result.directory, ".gitignore"), "utf8")).toContain(
      "node_modules/",
    );

    const packageJson = JSON.parse(
      await readFile(resolve(result.directory, "package.json"), "utf8"),
    ) as { name: string; dependencies: Record<string, string> };
    expect(packageJson.name).toBe("my-beast-app");
    expect(packageJson.dependencies["beast-tsrx"]).toBe("file:/local/beast-tsrx.tgz");
    expect(packageJson.dependencies.octane).toBe("0.2.0");
    expect(packageJson.dependencies["@octanejs/base-ui"]).toBe("0.1.50");
    const app = await readFile(resolve(result.directory, "src", "App.btsx"), "utf8");
    expect(app).toContain("props { docsUrl }: Props");
    expect(app).toContain("interface Props");
    expect(app).toContain("useState<PanelId>('language')");
    expect(app).toContain("navigator.clipboard.writeText(note)");
    expect(app).toContain("label: 'Integration'");
    expect(app).toContain("label: 'Skills'");
    expect(app).toContain('role="tablist"');
    expect(app).toContain("each panel in panels key panel.id");
    expect(await readFile(resolve(result.directory, "vite.config.ts"), "utf8")).toContain(
      "plugins: [beastOctane()]",
    );
    expect(await readFile(resolve(result.directory, "src/style.css"), "utf8")).not.toContain(
      "@import \"tailwindcss\"",
    );
    expect(await readFile(resolve(result.directory, "src/style.css"), "utf8")).not.toContain(
      "@import 'tailwindcss'",
    );
    expect(await readFile(resolve(result.directory, "src/style.css"), "utf8")).toContain(
      "tailwindcss v4.3.3",
    );
    expect(await readFile(resolve(result.directory, "public/beast.svg"), "utf8")).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg"',
    );
    expect(await readFile(resolve(result.directory, "index.html"), "utf8")).toContain(
      "Beast — Language, Integration & Skills",
    );
    const main = await readFile(resolve(result.directory, "src", "main.ts"), "utf8");
    expect(main).toContain("docsUrl");
    expect(main).toContain("https://beast-docs.vercel.app");
  });

  test("creates a Tailwind project with dedicated template", async () => {
    const cwd = await temporaryDirectory();
    const result = await createProject({
      cwd,
      directory: "my-tailwind-app",
      install: false,
      git: false,
      tailwind: true,
      compilerSpec: "file:/local/beast-tsrx.tgz",
    });

    expect(result.packageName).toBe("my-tailwind-app");
    const packageJson = JSON.parse(
      await readFile(resolve(result.directory, "package.json"), "utf8"),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(packageJson.dependencies.octane).toBe("0.2.0");
    expect(packageJson.devDependencies["tailwindcss"]).toBe("^4.3.3");
    expect(packageJson.devDependencies["@tailwindcss/vite"]).toBe("^4.3.3");
    const viteConfig = await readFile(resolve(result.directory, "vite.config.ts"), "utf8");
    expect(viteConfig).toContain('import tailwindcss from "@tailwindcss/vite"');
    expect(viteConfig).toContain("plugins: [tailwindcss(), beastOctane()]");
    const style = await readFile(resolve(result.directory, "src/style.css"), "utf8");
    expect(style).toContain('@import "tailwindcss"');
    const app = await readFile(resolve(result.directory, "src", "App.btsx"), "utf8");
    expect(app).toContain("props { docsUrl }: Props");
    expect(app).toContain("useState<PanelId>('language')");
    expect(app).toContain("navigator.clipboard.writeText(note)");
    expect(app).toContain("lg:grid-cols-[0.92fr_1.08fr]");
    expect(app).toContain('role="tablist"');
    expect(await readFile(resolve(result.directory, "public/beast.svg"), "utf8")).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg"',
    );
  });

  test("keeps CSS and Tailwind feature markup in parity", async () => {
    const cwd = await temporaryDirectory();
    const css = await createProject({
      cwd,
      directory: "css-app",
      install: false,
      git: false,
      compilerSpec: "file:/local/beast-tsrx.tgz",
    });
    const tailwind = await createProject({
      cwd,
      directory: "tailwind-app",
      install: false,
      git: false,
      tailwind: true,
      compilerSpec: "file:/local/beast-tsrx.tgz",
    });

    for (const path of ["src/App.btsx", "src/main.ts", "index.html", "public/beast.svg"]) {
      expect(await readFile(resolve(css.directory, path), "utf8")).toBe(
        await readFile(resolve(tailwind.directory, path), "utf8"),
      );
    }
  });

  test("creates a Rspack project with the Octane Radix binding", async () => {
    const cwd = await temporaryDirectory();
    const result = await createProject({
      cwd,
      directory: "rspack-radix",
      install: false,
      git: false,
      bundler: "rspack",
      ui: "radix",
    });
    const packageJson = JSON.parse(
      await readFile(resolve(result.directory, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(result.bundler).toBe("rspack");
    expect(result.ui).toBe("radix");
    expect(packageJson.dependencies["@octanejs/radix"]).toBe("0.1.51");
    expect(packageJson.devDependencies["@octanejs/rspack-plugin"]).toBe("0.1.47");
    expect(packageJson.devDependencies.vite).toBeUndefined();
    expect(packageJson.scripts.build).toBe("rspack build --mode production");
    const config = await readFile(resolve(result.directory, "rspack.config.ts"), "utf8");
    expect(config).toContain('from "beast-tsrx/rspack"');
    expect(config).toContain("new HtmlRspackPlugin");
    expect(await readFile(resolve(result.directory, "index.html"), "utf8"))
      .not.toContain('/src/main.ts');
  });

  test("creates an Rsbuild shadcn project with Tailwind enabled", async () => {
    const cwd = await temporaryDirectory();
    const result = await createProject({
      cwd,
      directory: "rsbuild-shadcn",
      install: false,
      git: false,
      bundler: "rsbuild",
      ui: "shadcn",
    });
    const packageJson = JSON.parse(
      await readFile(resolve(result.directory, "package.json"), "utf8"),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(packageJson.dependencies["@octanejs/shadcn"]).toBe("0.0.37");
    expect(packageJson.devDependencies["@octanejs/rsbuild-plugin"]).toBe("0.1.47");
    expect(packageJson.devDependencies["@rsbuild/plugin-tailwindcss"]).toBe("^2.0.3");
    const config = await readFile(resolve(result.directory, "rsbuild.config.ts"), "utf8");
    expect(config).toContain('from "beast-tsrx/rsbuild"');
    expect(config).toContain("pluginTailwindcss()");
    expect(await readFile(resolve(result.directory, "src/style.css"), "utf8"))
      .toContain('@source "../node_modules/@octanejs/shadcn"');
  });

  test("refuses a non-empty directory unless force is explicit", async () => {
    const cwd = await temporaryDirectory();
    const target = resolve(cwd, "existing");
    await Bun.write(resolve(target, "mine.txt"), "keep me");

    await expect(
      createProject({ cwd, directory: "existing", install: false, git: false }),
    ).rejects.toThrow("Target directory is not empty");

    await createProject({
      cwd,
      directory: "existing",
      install: false,
      git: false,
      force: true,
    });
    expect(await readFile(resolve(target, "mine.txt"), "utf8")).toBe("keep me");
  });
});
