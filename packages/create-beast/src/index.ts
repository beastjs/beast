#!/usr/bin/env node
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_DIRECTORY = "beast-app";
const DEFAULT_COMPILER_SPEC = "latest";
const DEFAULT_BUNDLER: Bundler = "vite";
const DEFAULT_UI: UiLibrary = "base-ui";
const TEMPLATE_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "../template");
const TEMPLATE_TAILWIND_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../template-tailwind",
);

const HELP = `Create Beast — scaffold a Beast and Octane project

Usage:
  bun create beast@latest [directory] [options]
  bun x create-beast@latest [directory] [options]

Options:
  --bundler <name>  Build with vite, rspack, or rsbuild.
  --ui <name>       Add base-ui, radix, or shadcn.
  --tailwind    Scaffold with Tailwind CSS.
  --no-install  Create files without running bun install.
  --no-git      Do not initialize a Git repository.
  --force       Write template files into a non-empty directory.
  -h, --help    Show this help.
`;

export type Bundler = "vite" | "rspack" | "rsbuild";
export type UiLibrary = "base-ui" | "radix" | "shadcn";

const BUNDLERS = ["vite", "rspack", "rsbuild"] as const;
const UI_LIBRARIES = ["base-ui", "radix", "shadcn"] as const;
const UI_PACKAGES: Readonly<Record<UiLibrary, readonly [string, string]>> = {
  "base-ui": ["@octanejs/base-ui", "0.1.51"],
  radix: ["@octanejs/radix", "0.1.52"],
  shadcn: ["@octanejs/shadcn", "0.0.38"],
};

export interface CreateProjectOptions {
  directory: string;
  cwd?: string;
  force?: boolean;
  install?: boolean;
  git?: boolean;
  tailwind?: boolean;
  bundler?: Bundler;
  ui?: UiLibrary;
  /** Override used by local integration tests and prerelease channels. */
  compilerSpec?: string;
}

export interface CreateProjectResult {
  directory: string;
  packageName: string;
  installed: boolean;
  gitInitialized: boolean;
  bundler: Bundler;
  ui: UiLibrary;
}

export async function createProject(
  options: CreateProjectOptions,
): Promise<CreateProjectResult> {
  const requestedDirectory = options.directory.trim();
  if (requestedDirectory.length === 0) throw new Error("The project directory cannot be empty.");

  const cwd = resolve(options.cwd ?? process.cwd());
  const target = resolve(cwd, requestedDirectory);
  const packageName = normalizePackageName(basename(target));
  const bundler = options.bundler ?? DEFAULT_BUNDLER;
  const ui = options.ui ?? DEFAULT_UI;
  const tailwind = options.tailwind === true || ui === "shadcn";
  await prepareTarget(target, options.force === true);
  const templateSource =
    tailwind ? TEMPLATE_TAILWIND_DIRECTORY : TEMPLATE_DIRECTORY;
  await copyTemplate(templateSource, target, {
    "__PROJECT_NAME__": packageName,
    "__BEAST_PACKAGE_SPEC__": options.compilerSpec ?? DEFAULT_COMPILER_SPEC,
  });
  await configureProject(target, bundler, ui, tailwind);

  let gitInitialized = false;
  if (options.git !== false && (await runCommand("git", ["--version"], cwd, "ignore")) === 0) {
    gitInitialized = (await runCommand("git", ["init"], target, "inherit")) === 0;
  }

  let installed = false;
  if (options.install !== false) {
    const installStatus = await runCommand("bun", ["install"], target, "inherit");
    if (installStatus !== 0) {
      throw new Error(
        "The project was created, but bun install failed. Run it manually in the project directory.",
      );
    }
    installed = true;
  }

  return { directory: target, packageName, installed, gitInitialized, bundler, ui };
}

export async function runCli(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }

  try {
    const args = argv.filter((arg) => arg !== "--");
    const install = !takeFlag(args, "--no-install");
    const git = !takeFlag(args, "--no-git");
    const force = takeFlag(args, "--force");
    const tailwind = takeFlag(args, "--tailwind");
    const bundlerOption = takeOption(args, "--bundler");
    const uiOption = takeOption(args, "--ui");
    const unknown = args.find((arg) => arg.startsWith("-"));
    if (unknown !== undefined) throw new Error(`Unknown option: ${unknown}`);
    if (args.length > 1) throw new Error("Create Beast accepts at most one project directory.");

    const directory = args[0] ?? (await askForDirectory());
    const bundler = bundlerOption === undefined
      ? await askForChoice("Bundler", BUNDLERS, DEFAULT_BUNDLER)
      : parseChoice("bundler", bundlerOption, BUNDLERS);
    const ui = uiOption === undefined
      ? await askForChoice("UI library", UI_LIBRARIES, DEFAULT_UI)
      : parseChoice("UI library", uiOption, UI_LIBRARIES);
    console.log(`\nCreating a Beast project in ${resolve(directory)}...\n`);
    const result = await createProject({ directory, force, install, git, tailwind, bundler, ui });
    const nextDirectory = relative(process.cwd(), result.directory) || ".";

    console.log("\nBeast project created.");
    console.log(`\n  cd ${shellDisplay(nextDirectory)}`);
    if (!result.installed) console.log("  bun install");
    console.log("  bun run dev\n");
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function askForDirectory(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return DEFAULT_DIRECTORY;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await prompt.question(`Project directory (${DEFAULT_DIRECTORY}): `)).trim();
    return answer || DEFAULT_DIRECTORY;
  } finally {
    prompt.close();
  }
}

async function askForChoice<T extends string>(
  label: string,
  choices: readonly T[],
  fallback: T,
): Promise<T> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return fallback;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`\n${label}:`);
    choices.forEach((choice, index) => {
      console.log(`  ${index + 1}. ${choice}${choice === fallback ? " (default)" : ""}`);
    });
    const answer = (await prompt.question(`Choose ${label.toLowerCase()} [1-${choices.length}]: `))
      .trim();
    if (answer === "") return fallback;
    const numeric = Number(answer);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length) {
      return choices[numeric - 1]!;
    }
    return parseChoice(label, answer, choices);
  } finally {
    prompt.close();
  }
}

function parseChoice<T extends string>(
  label: string,
  value: string,
  choices: readonly T[],
): T {
  if ((choices as readonly string[]).includes(value)) return value as T;
  throw new Error(`Invalid ${label}: ${value}. Choose ${choices.join(", ")}.`);
}

async function prepareTarget(target: string, force: boolean): Promise<void> {
  try {
    const targetStat = await stat(target);
    if (!targetStat.isDirectory()) throw new Error(`Target exists and is not a directory: ${target}`);
    const entries = await readdir(target);
    if (entries.length > 0 && !force) {
      throw new Error(
        `Target directory is not empty: ${target}\nChoose another directory or pass --force.`,
      );
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      await mkdir(target, { recursive: true });
      return;
    }
    throw error;
  }
}

async function copyTemplate(
  source: string,
  target: string,
  replacements: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = resolve(source, entry.name);
    const outputName = entry.name === "gitignore" ? ".gitignore" : entry.name;
    const targetPath = resolve(target, outputName);
    if (entry.isDirectory()) {
      await copyTemplate(sourcePath, targetPath, replacements);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === "favicon.ico") {
      await copyFile(sourcePath, targetPath);
      continue;
    }
    let contents = await readFile(sourcePath, "utf8");
    for (const [placeholder, value] of Object.entries(replacements)) {
      contents = contents.replaceAll(placeholder, value);
    }
    await writeFile(targetPath, contents, "utf8");
  }
}

async function configureProject(
  target: string,
  bundler: Bundler,
  ui: UiLibrary,
  tailwind: boolean,
): Promise<void> {
  const packageJsonPath = resolve(target, "package.json");
  const packageJsonText = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonText) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  packageJson.dependencies ??= {};
  packageJson.devDependencies ??= {};
  const [uiPackage, uiVersion] = UI_PACKAGES[ui];
  packageJson.dependencies[uiPackage] = uiVersion;

  packageJson.scripts = {
    ...packageJson.scripts,
    ...(bundler === "vite"
      ? { dev: "vite", build: "vite build", preview: "vite preview" }
      : bundler === "rspack"
        ? {
            dev: "rspack serve --mode development",
            build: "rspack build --mode production",
            preview: "rspack serve --mode production",
          }
        : { dev: "rsbuild dev", build: "rsbuild build", preview: "rsbuild preview" }),
  };

  delete packageJson.devDependencies.vite;
  delete packageJson.devDependencies["@tailwindcss/vite"];
  if (bundler === "vite") packageJson.devDependencies.vite = "^8.0.16";
  if (bundler === "rspack") {
    packageJson.devDependencies["@rspack/core"] = "^2.2.2";
    packageJson.devDependencies["@rspack/cli"] = "^2.2.2";
    packageJson.devDependencies["@rspack/dev-server"] = "^2.2.1";
    packageJson.devDependencies["@octanejs/rspack-plugin"] = "0.1.48";
  }
  if (bundler === "rsbuild") {
    packageJson.devDependencies["@rsbuild/core"] = "^2.2.2";
    packageJson.devDependencies["@octanejs/rsbuild-plugin"] = "0.1.48";
  }

  if (tailwind) {
    packageJson.devDependencies.tailwindcss = "^4.3.3";
    if (bundler === "vite") packageJson.devDependencies["@tailwindcss/vite"] = "^4.3.3";
    if (bundler === "rspack") {
      packageJson.devDependencies["@tailwindcss/postcss"] = "^4.3.3";
      packageJson.devDependencies["postcss-loader"] = "^8.2.1";
    }
    if (bundler === "rsbuild") {
      packageJson.devDependencies["@rsbuild/plugin-tailwindcss"] = "^2.0.3";
    }
  }
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const viteConfigPath = resolve(target, "vite.config.ts");
  if (bundler === "vite") {
    await writeFile(
      viteConfigPath,
      `import { defineConfig } from "vite";\n${tailwind ? 'import tailwindcss from "@tailwindcss/vite";\n' : ""}import { beastOctane } from "beast-tsrx/vite";\n\nexport default defineConfig({\n  plugins: [${tailwind ? "tailwindcss(), " : ""}beastOctane()],\n});\n`,
      "utf8",
    );
  } else {
    await rm(viteConfigPath);
    const htmlPath = resolve(target, "index.html");
    const html = await readFile(htmlPath, "utf8");
    await writeFile(htmlPath, html.replace(/^\s*<script type="module" src="\/src\/main\.ts"><\/script>\s*$/mu, ""), "utf8");
    if (bundler === "rspack") {
      await writeFile(resolve(target, "rspack.config.ts"), rspackConfig(tailwind), "utf8");
      if (tailwind) {
        await writeFile(
          resolve(target, "postcss.config.mjs"),
          'export default { plugins: { "@tailwindcss/postcss": {} } };\n',
          "utf8",
        );
      }
    } else {
      await writeFile(resolve(target, "rsbuild.config.ts"), rsbuildConfig(tailwind), "utf8");
    }
  }

  const tsconfigPath = resolve(target, "tsconfig.json");
  const tsconfig = JSON.parse(await readFile(tsconfigPath, "utf8")) as {
    compilerOptions: { types?: string[] };
    include: string[];
  };
  if (bundler === "vite") tsconfig.compilerOptions.types = ["vite/client"];
  else delete tsconfig.compilerOptions.types;
  tsconfig.include = ["src", `${bundler}.config.ts`];
  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");

  const readmePath = resolve(target, "README.md");
  const readme = await readFile(readmePath, "utf8");
  const uiImport = ui === "base-ui"
    ? 'import { Button } from "@octanejs/base-ui/button";'
    : ui === "radix"
      ? 'import { Dialog, Separator } from "@octanejs/radix";'
      : 'import { Button } from "@octanejs/shadcn/Button";\nimport "@octanejs/shadcn/theme.css";';
  await writeFile(
    readmePath,
    `${readme.trimEnd()}\n\n## Selected stack\n\n- Bundler: ${bundler}\n- UI: ${ui} (${uiPackage})${tailwind ? "\n- Styling: Tailwind CSS v4" : ""}\n\n\`\`\`ts\n${uiImport}\n\`\`\`\n`,
    "utf8",
  );

  const stylePath = resolve(target, "src/style.css");
  if (ui === "shadcn") {
    const style = await readFile(stylePath, "utf8");
    await writeFile(
      stylePath,
      `${style.trimEnd()}\n@source "../node_modules/@octanejs/shadcn";\n`,
      "utf8",
    );
  }
}

function rspackConfig(tailwind: boolean): string {
  return `import { HtmlRspackPlugin, type Configuration } from "@rspack/core";\nimport { beastOctane } from "beast-tsrx/rspack";\n\nconst config: Configuration = {\n  entry: "./src/main.ts",\n  experiments: { css: true },\n  module: { rules: [${tailwind ? '{ test: /\\.css$/u, type: "css", use: ["postcss-loader"] }' : '{ test: /\\.css$/u, type: "css" }'}] },\n  plugins: [new HtmlRspackPlugin({ template: "./index.html" }), beastOctane()],\n  devServer: { historyApiFallback: true },\n};\n\nexport default config;\n`;
}

function rsbuildConfig(tailwind: boolean): string {
  return `import { defineConfig } from "@rsbuild/core";\n${tailwind ? 'import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";\n' : ""}import { beastOctane } from "beast-tsrx/rsbuild";\n\nexport default defineConfig({\n  source: { entry: { index: "./src/main.ts" } },\n  html: { template: "./index.html" },\n  plugins: [${tailwind ? "pluginTailwindcss(), " : ""}...beastOctane()],\n});\n`;
}

function normalizePackageName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^[._-]+|[._-]+$/gu, "")
    .slice(0, 214);
  return normalized || DEFAULT_DIRECTORY;
}

function takeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function takeOption(args: string[], name: string): string | undefined {
  const inlineIndex = args.findIndex((arg) => arg.startsWith(`${name}=`));
  if (inlineIndex !== -1) return args.splice(inlineIndex, 1)[0]!.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("-")) throw new Error(`${name} requires a value.`);
  args.splice(index, 2);
  return value;
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  stdio: "ignore" | "inherit",
): Promise<number | null> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, stdio });
    child.once("error", () => done(null));
    child.once("exit", (code) => done(code));
  });
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function shellDisplay(path: string): string {
  return /\s/u.test(path) ? JSON.stringify(path) : path;
}

const entry = process.argv[1];
if (
  entry !== undefined &&
  realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
