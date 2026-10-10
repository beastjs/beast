#!/usr/bin/env node
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { askForNextStep, askForSetup, banner, finish, isInteractive, nextCommands, progress, reportError, SetupCancelled } from "./ui.js";

const DEFAULT_DIRECTORY = "beast-app";
const DEFAULT_COMPILER_SPEC = "0.12.1";
const DEFAULT_BUNDLER: Bundler = "vite";
const DEFAULT_UI: UiLibrary = "base-ui";
const TEMPLATE_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "../template");
const TEMPLATE_TAILWIND_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../template-tailwind",
);

const HELP = `
  beast / create

  bun create beast@latest [directory] [options]

  Stack
    --bundler <name>   vite · rspack · rsbuild
    --ui <name>        base-ui · radix · shadcn
    --tailwind         Tailwind CSS v4

  Optional tools
    --devtools         In-page inspection and profiling
    --page-builder     Page Builder development widget
    --beast-ui         Initialize Beast UI (enables Tailwind)
    --icons            Initialize the typed Beast icon pipeline
    --no-addons        Skip the optional tools prompt

  Setup
    -y, --yes          Accept defaults for unanswered prompts
    --no-install       Write files; print remaining setup commands
    --no-git           Skip Git initialization
    --force            Allow a non-empty directory
    -h, --help         Show help
`;

export type Bundler = "vite" | "rspack" | "rsbuild";
export type UiLibrary = "base-ui" | "radix" | "shadcn";
export type Addon = "devtools" | "page-builder" | "beast-ui" | "icons";
export type ProjectAction = "open" | "run";

const ADDON_PACKAGES = {
  devtools: ["@beastjs/devtools", "0.1.21"],
  "page-builder": ["@beastjs/page-builder", "0.1.0"],
  "beast-ui": ["@beastjs/cli", "0.3.3"],
  icons: ["@beastjs/cli", "0.3.3"],
} as const;

const BUNDLERS = ["vite", "rspack", "rsbuild"] as const;
const UI_LIBRARIES = ["base-ui", "radix", "shadcn"] as const;
const UI_PACKAGES: Readonly<Record<UiLibrary, readonly [string, string]>> = {
  "base-ui": ["@octanejs/base-ui", "0.1.65"],
  radix: ["@octanejs/radix", "0.1.65"],
  shadcn: ["@octanejs/shadcn", "0.0.54"],
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
  devtools?: boolean;
  pageBuilder?: boolean;
  beastUi?: boolean;
  icons?: boolean;
  /** Override used by local integration tests and prerelease channels. */
  compilerSpec?: string;
}

export interface CommandResult {
  code: number | null;
  output: string;
}

export interface CreateProjectHooks {
  onProgress?: (message: string) => void;
  quiet?: boolean;
  /** Injectable process runner for integration tests and embedding. */
  runCommand?: typeof runCommand;
}

export interface CliHooks extends CreateProjectHooks {
  /** Local compiler tarball or prerelease version for CLI previews. */
  compilerSpec?: string;
  /** Injectable final selection for integration tests and embedding. */
  selectNextStep?: () => Promise<ProjectAction | undefined>;
}

export interface CreateProjectResult {
  directory: string;
  packageName: string;
  installed: boolean;
  gitInitialized: boolean;
  bundler: Bundler;
  ui: UiLibrary;
  addons: Addon[];
  pendingCommands: string[];
}

export async function createProject(
  options: CreateProjectOptions,
  hooks: CreateProjectHooks = {},
): Promise<CreateProjectResult> {
  const requestedDirectory = options.directory.trim();
  if (requestedDirectory.length === 0) throw new Error("The project directory cannot be empty.");

  const cwd = resolve(options.cwd ?? process.cwd());
  const target = resolve(cwd, requestedDirectory);
  const packageName = normalizePackageName(basename(target));
  const bundler = parseChoice("bundler", options.bundler ?? DEFAULT_BUNDLER, BUNDLERS);
  const ui = parseChoice("UI library", options.ui ?? DEFAULT_UI, UI_LIBRARIES);
  const addons: Addon[] = [];
  if (options.devtools) addons.push("devtools");
  if (options.pageBuilder) addons.push("page-builder");
  if (options.beastUi) addons.push("beast-ui");
  if (options.icons) addons.push("icons");
  const tailwind = options.tailwind === true || ui === "shadcn" || options.beastUi === true;
  const run = hooks.runCommand ?? runCommand;
  const stdio = hooks.quiet ? "pipe" : "inherit";
  hooks.onProgress?.("Writing project files");
  await prepareTarget(target, options.force === true);
  const templateSource =
    tailwind ? TEMPLATE_TAILWIND_DIRECTORY : TEMPLATE_DIRECTORY;
  await copyTemplate(templateSource, target, {
    "__PROJECT_NAME__": packageName,
    "__BEAST_PACKAGE_SPEC__": options.compilerSpec ?? DEFAULT_COMPILER_SPEC,
  });
  await configureProject(target, bundler, ui, tailwind, addons);

  let gitInitialized = false;
  if (options.git !== false && (await run("git", ["--version"], cwd, "ignore")).code === 0) {
    hooks.onProgress?.("Initializing Git");
    gitInitialized = (await run("git", ["init"], target, stdio)).code === 0;
  }

  const initializers = initializationCommands(addons);
  let installed = false;
  if (options.install !== false) {
    hooks.onProgress?.("Installing dependencies");
    const installation = await run("bun", ["install"], target, stdio);
    if (installation.code !== 0) {
      throw new Error(commandFailure(target, ["bun install", ...initializers.map(displayCommand)], installation));
    }
    installed = true;
    for (const [index, initializer] of initializers.entries()) {
      hooks.onProgress?.(initializer[2] === "init" ? "Initializing Beast UI" : "Building the Beast icon pipeline");
      const initialization = await run("bun", initializer, target, stdio);
      if (initialization.code !== 0) {
        throw new Error(commandFailure(target, initializers.slice(index).map(displayCommand), initialization));
      }
    }
  }

  return {
    directory: target, packageName, installed, gitInitialized, bundler, ui, addons,
    pendingCommands: installed ? [] : initializers.map(displayCommand),
  };
}

function initializationCommands(addons: readonly Addon[]): string[][] {
  const commands: string[][] = [];
  if (addons.includes("beast-ui")) commands.push(["run", "beast-ui", "init", "--package-manager", "bun"]);
  if (addons.includes("icons")) commands.push(["run", "beast-ui", "icons", "init", "--framework", "beast"]);
  return commands;
}

function displayCommand(args: readonly string[]): string {
  return `bun ${args.join(" ")}`;
}

function commandFailure(target: string, commands: readonly string[], result: CommandResult): string {
  return `Project files are ready in ${target}, but setup failed${result.code === null ? " (command unavailable)" : ` (exit ${result.code})`}.\n${result.output.trim() ? `\n${result.output.trim()}\n` : ""}\nContinue with:\n  cd ${shellDisplay(target)}\n  ${commands.join("\n  ")}`;
}

export async function runCli(argv: string[], hooks: CliHooks = {}): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }

  let activity: ReturnType<typeof progress> | undefined;
  try {
    const args = argv.filter((arg) => arg !== "--");
    const install = !takeFlag(args, "--no-install");
    const git = !takeFlag(args, "--no-git");
    const force = takeFlag(args, "--force");
    const yes = takeFlag(args, "--yes") || takeFlag(args, "-y");
    const tailwind = takeFlag(args, "--tailwind");
    const noAddons = takeFlag(args, "--no-addons");
    const devtools = takeFlag(args, "--devtools");
    const pageBuilder = takeFlag(args, "--page-builder");
    const beastUi = takeFlag(args, "--beast-ui");
    const icons = takeFlag(args, "--icons");
    if (noAddons && (devtools || pageBuilder || beastUi || icons)) {
      throw new Error("--no-addons cannot be combined with optional tool flags.");
    }
    const bundlerOption = takeOption(args, "--bundler");
    const uiOption = takeOption(args, "--ui");
    const unknown = args.find((arg) => arg.startsWith("-"));
    if (unknown !== undefined) throw new Error(`Unknown option: ${unknown}`);
    if (args.length > 1) throw new Error("Create Beast accepts at most one project directory.");
    const bundler = bundlerOption === undefined ? undefined : parseChoice("bundler", bundlerOption, BUNDLERS);
    const ui = uiOption === undefined ? undefined : parseChoice("UI library", uiOption, UI_LIBRARIES);

    banner();
    const setup = await askForSetup({
      ...(args[0] === undefined ? {} : { directory: args[0] }),
      ...(bundler === undefined ? {} : { bundler }),
      ...(ui === undefined ? {} : { ui }),
      tailwind, devtools, pageBuilder, beastUi, icons,
    }, { yes, noAddons });
    activity = progress();
    const result = await createProject({
      ...setup, force, install, git,
      ...(hooks.compilerSpec === undefined ? {} : { compilerSpec: hooks.compilerSpec }),
    }, {
      ...hooks,
      quiet: true,
      onProgress: (message) => {
        activity!.update(message);
        hooks.onProgress?.(message);
      },
    });
    activity.stop(`Created ${result.packageName}`);
    activity = undefined;
    const nextDirectory = relative(process.cwd(), result.directory) || ".";
    const offerNextStep = result.installed && !yes &&
      (hooks.selectNextStep !== undefined || isInteractive());
    finish(result, shellDisplay(nextDirectory), !offerNextStep);
    if (offerNextStep) {
      const action = await (hooks.selectNextStep ?? askForNextStep)();
      if (action !== undefined) return await launchProject(result.directory, action, hooks.runCommand ?? runCommand);
      nextCommands(result, shellDisplay(nextDirectory));
    }
    return 0;
  } catch (error) {
    if (error instanceof SetupCancelled) return 130;
    activity?.error();
    reportError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function launchProject(
  directory: string,
  action: ProjectAction,
  run: typeof runCommand,
): Promise<number> {
  const windows = process.platform === "win32";
  const shell = windows ? process.env.ComSpec || "cmd.exe" : process.env.SHELL || "/bin/sh";
  const args = windows ? ["/K"] : ["-i"];
  // Child processes cannot change the parent shell's directory. Keep an
  // interactive shell in the project so both actions actually navigate there.
  // Let the foreground command handle Ctrl+C while the launcher waits for it.
  const keepLauncherAlive = (): void => {};
  process.on("SIGINT", keepLauncherAlive);
  try {
    if (action === "run") {
      const server = await run("bun", ["run", "dev"], directory, "inherit");
      if (server.code === null && server.output) {
        throw new Error(`Could not start the development server: ${server.output}\nRun: cd ${shellDisplay(directory)} && bun run dev`);
      }
    }
    const result = await run(shell, args, directory, "inherit");
    if (result.code === null && result.output) {
      throw new Error(`Could not open the project shell: ${result.output}\nRun: cd ${shellDisplay(directory)}`);
    }
    return result.code ?? 130;
  } finally {
    process.removeListener("SIGINT", keepLauncherAlive);
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
  addons: readonly Addon[],
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
  for (const addon of addons) {
    const [name, version] = ADDON_PACKAGES[addon];
    packageJson.devDependencies[name] = version;
  }

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
    packageJson.devDependencies["@octanejs/rspack-plugin"] = "0.2.2";
  }
  if (bundler === "rsbuild") {
    packageJson.devDependencies["@rsbuild/core"] = "^2.2.2";
    packageJson.devDependencies["@octanejs/rsbuild-plugin"] = "0.1.63";
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
    await writeFile(viteConfigPath, viteConfig(tailwind, addons), "utf8");
  } else {
    await rm(viteConfigPath);
    const htmlPath = resolve(target, "index.html");
    const html = await readFile(htmlPath, "utf8");
    await writeFile(htmlPath, html.replace(/^\s*<script type="module" src="\/src\/main\.ts"><\/script>\s*$/mu, ""), "utf8");
    if (bundler === "rspack") {
      await writeFile(resolve(target, "rspack.config.ts"), rspackConfig(tailwind, addons), "utf8");
      if (tailwind) {
        await writeFile(
          resolve(target, "postcss.config.mjs"),
          'export default { plugins: { "@tailwindcss/postcss": {} } };\n',
          "utf8",
        );
      }
    } else {
      await writeFile(resolve(target, "rsbuild.config.ts"), rsbuildConfig(tailwind, addons), "utf8");
    }
  }

  const tsconfigPath = resolve(target, "tsconfig.json");
  const tsconfig = JSON.parse(await readFile(tsconfigPath, "utf8")) as {
    compilerOptions: { types?: string[] };
    include: string[];
  };
  // Generated bundler configs resolve the `@/*` source alias through `node:url`.
  tsconfig.compilerOptions.types = bundler === "vite" ? ["vite/client", "node"] : ["node"];
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
  if (addons.length > 0) {
    const details = ["\n## Optional tools\n"];
    if (addons.includes("devtools")) details.push("- Beast Devtools: press **Alt+Shift+D** while the dev server runs. Octane profiling is enabled only in development.");
    if (addons.includes("page-builder")) details.push("- Beast Page Builder: press **⌘B / Ctrl+B** while the dev server runs. Creating routes requires a TanStack router and an app shell with an Outlet; this starter does not create those automatically.");
    if (addons.includes("beast-ui")) details.push("- Beast UI: `bun run beast-ui add button` copies editable components into `src/components/ui`. Tailwind CSS v4 and the `@/*` alias are already configured.");
    if (addons.includes("icons")) details.push("- Beast icons: import `{ Icon }` from `@/lib/icons`. Add SVGs to `src/lib/icons/svg`, then run `bun run icons:build`. Check generated output with `bun run icons:check`.");
    const commands = initializationCommands(addons).map(displayCommand);
    if (commands.length > 0) details.push(`\nSetup commands (the builder runs these after installation; run them yourself with \`--no-install\`):\n\n\`\`\`sh\nbun install\n${commands.join("\n")}\n\`\`\``);
    await writeFile(readmePath, (await readFile(readmePath, "utf8")) + details.join("\n") + "\n", "utf8");
  }

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

/** Mirrors the tsconfig `@/*` path so bundlers resolve imports from `src`. */
const SOURCE_ALIAS = `  resolve: {\n    alias: {\n      "@": fileURLToPath(new URL("./src", import.meta.url)),\n    },\n  },\n`;

function toolImports(bundler: Bundler, addons: readonly Addon[]): string {
  return `${addons.includes("devtools") ? `import { beastDevtools } from "@beastjs/devtools/${bundler}";\n` : ""}${addons.includes("page-builder") ? `import { beastPageBuilder } from "@beastjs/page-builder/${bundler}";\n` : ""}`;
}

function toolPlugins(addons: readonly Addon[]): string {
  return `${addons.includes("devtools") ? ", beastDevtools()" : ""}${addons.includes("page-builder") ? ", beastPageBuilder()" : ""}`;
}

function compilerPlugin(bundler: Bundler, addons: readonly Addon[]): string {
  return addons.includes("devtools")
    ? `beastOctane({ octane: { profile: ${bundler === "vite" ? '"auto"' : 'process.env.NODE_ENV !== "production"'} } })`
    : "beastOctane()";
}

function viteConfig(tailwind: boolean, addons: readonly Addon[]): string {
  return `import { fileURLToPath } from "node:url";\n${tailwind ? 'import tailwindcss from "@tailwindcss/vite";\n' : ""}import { beastOctane } from "beast-tsrx/vite";\n${toolImports("vite", addons)}import { defineConfig } from "vite";\n\nexport default defineConfig({\n${SOURCE_ALIAS}  plugins: [${tailwind ? "tailwindcss(), " : ""}${compilerPlugin("vite", addons)}${toolPlugins(addons)}],\n});\n`;
}

function rspackConfig(tailwind: boolean, addons: readonly Addon[]): string {
  return `import { fileURLToPath } from "node:url";\nimport { HtmlRspackPlugin, type Configuration } from "@rspack/core";\nimport { beastOctane } from "beast-tsrx/rspack";\n${toolImports("rspack", addons)}\nconst config: Configuration = {\n  entry: "./src/main.ts",\n${SOURCE_ALIAS}  experiments: { css: true },\n  module: { rules: [${tailwind ? '{ test: /\\.css$/u, type: "css", use: ["postcss-loader"] }' : '{ test: /\\.css$/u, type: "css" }'}] },\n  plugins: [new HtmlRspackPlugin({ template: "./index.html" }), ${compilerPlugin("rspack", addons)}${toolPlugins(addons)}],\n  devServer: { historyApiFallback: true },\n};\n\nexport default config;\n`;
}

function rsbuildConfig(tailwind: boolean, addons: readonly Addon[]): string {
  return `import { fileURLToPath } from "node:url";\nimport { defineConfig } from "@rsbuild/core";\n${tailwind ? 'import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";\n' : ""}import { beastOctane } from "beast-tsrx/rsbuild";\n${toolImports("rsbuild", addons)}\nexport default defineConfig({\n  source: { entry: { index: "./src/main.ts" } },\n${SOURCE_ALIAS}  html: { template: "./index.html" },\n  plugins: [${tailwind ? "pluginTailwindcss(), " : ""}...${compilerPlugin("rsbuild", addons)}${toolPlugins(addons)}],\n});\n`;
}

function normalizePackageName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^[._-]+/u, "");
  let end = normalized.length;
  while (end > 0 && "._-".includes(normalized[end - 1]!)) end -= 1;
  return normalized.slice(0, Math.min(end, 214)) || DEFAULT_DIRECTORY;
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
  stdio: "ignore" | "inherit" | "pipe",
): Promise<CommandResult> {
  return new Promise((done) => {
    let output = "";
    const child = spawn(command, args, { cwd, stdio: stdio === "pipe" ? ["ignore", "pipe", "pipe"] : stdio });
    const collect = (chunk: Buffer): void => { output = (output + chunk.toString()).slice(-65_536); };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.once("error", (error) => done({ code: null, output: error.message }));
    child.once("close", (code) => done({ code, output }));
  });
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function shellDisplay(path: string): string {
  return /^[a-zA-Z0-9_./-]+$/u.test(path) ? path : "'" + path.replaceAll("'", "'\\''") + "'";
}

function isCliEntry(entry: string | undefined): boolean {
  if (entry === undefined || entry === "-") return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isCliEntry(process.argv[1])) {
  process.exitCode = await runCli(process.argv.slice(2));
}
