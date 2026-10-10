import * as prompts from "@clack/prompts";
import color from "picocolors";
import type { Addon, Bundler, CreateProjectOptions, CreateProjectResult, ProjectAction, UiLibrary } from "./index.js";

export class SetupCancelled extends Error {}

function answer<T>(value: T): Exclude<T, symbol> {
  if (prompts.isCancel(value)) {
    console.log(`\n  ${color.dim("Setup cancelled.")}\n`);
    throw new SetupCancelled();
  }
  return value as Exclude<T, symbol>;
}

export function banner(): void {
  console.log(`\n  ${color.bold("beast")} ${color.dim("/ create")}\n`);
}

export function isInteractive(yes = false): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !yes && !process.env.CI);
}

export async function askForSetup(
  supplied: Omit<CreateProjectOptions, "directory"> & { directory?: string },
  settings: { yes: boolean; noAddons: boolean },
): Promise<CreateProjectOptions> {
  const interactive = isInteractive(settings.yes);
  const directory = supplied.directory ?? (interactive ? answer(await prompts.text({
    message: "Project directory",
    placeholder: "beast-app",
    defaultValue: "beast-app",
    withGuide: false,
    validate: (value) => value?.trim() ? undefined : "Enter a project directory.",
  })).trim() : "beast-app");
  const bundler = supplied.bundler ?? (interactive ? answer(await prompts.select<Bundler>({
    message: "Bundler",
    initialValue: "vite",
    withGuide: false,
    showInstructions: false,
    options: [
      { value: "vite", label: "Vite", hint: "recommended" },
      { value: "rspack", label: "Rspack" },
      { value: "rsbuild", label: "Rsbuild" },
    ],
  })) : "vite");
  const ui = supplied.ui ?? (interactive ? answer(await prompts.select<UiLibrary>({
    message: "UI primitives",
    initialValue: "base-ui",
    withGuide: false,
    showInstructions: false,
    options: [
      { value: "base-ui", label: "Base UI", hint: "recommended" },
      { value: "radix", label: "Radix" },
      { value: "shadcn", label: "shadcn", hint: "includes Tailwind" },
    ],
  })) : "base-ui");
  let addons: Addon[] = [];
  if (supplied.devtools) addons.push("devtools");
  if (supplied.pageBuilder) addons.push("page-builder");
  if (supplied.beastUi) addons.push("beast-ui");
  if (supplied.icons) addons.push("icons");
  if (interactive && !settings.noAddons && addons.length === 0) {
    addons = answer(await prompts.multiselect<Addon>({
      message: "Optional tools",
      withGuide: false,
      required: false,
      options: [
        { value: "devtools", label: "Devtools", hint: "inspect · profile" },
        { value: "page-builder", label: "Page Builder", hint: "scaffold pages" },
        { value: "beast-ui", label: "Beast UI", hint: "source components · Tailwind" },
        { value: "icons", label: "Beast icons", hint: "typed SVG pipeline" },
      ],
    }));
  }
  const tailwind = supplied.tailwind === true || ui === "shadcn" || addons.includes("beast-ui") ||
    (interactive ? answer(await prompts.select<boolean>({
      message: "Styling",
      initialValue: false,
      withGuide: false,
      showInstructions: false,
      options: [
        { value: false, label: "CSS", hint: "minimal" },
        { value: true, label: "Tailwind CSS", hint: "v4" },
      ],
    })) : false);
  return {
    ...supplied, directory, bundler, ui, tailwind,
    devtools: addons.includes("devtools"), pageBuilder: addons.includes("page-builder"),
    beastUi: addons.includes("beast-ui"), icons: addons.includes("icons"),
  };
}

export function progress(): { update: (message: string) => void; stop: (message: string) => void; error: () => void } {
  const animated = process.stdout.isTTY && !process.env.CI;
  const indicator = animated ? prompts.spinner({ withGuide: false, styleFrame: color.dim }) : undefined;
  let started = false;
  return {
    update(message) {
      if (indicator) {
        if (started) indicator.message(message);
        else { indicator.start(message); started = true; }
      }
    },
    stop(message) {
      if (started) indicator!.stop(message);
      else console.log(`  ${message}`);
    },
    error() { if (started) indicator!.error("Setup incomplete"); },
  };
}

export function finish(result: CreateProjectResult, directory: string, showCommands = true): void {
  const tools = result.addons.map((addon) => ({
    devtools: "Devtools", "page-builder": "Page Builder", "beast-ui": "Beast UI", icons: "icons",
  })[addon]);
  console.log(`  ${color.dim([result.bundler, result.ui, ...tools].join(" · "))}\n`);
  if (showCommands) nextCommands(result, directory);
}

export function nextCommands(result: CreateProjectResult, directory: string): void {
  if (directory !== ".") console.log(`  ${color.dim("cd")} ${directory}`);
  if (!result.installed) console.log("  bun install");
  for (const command of result.pendingCommands) console.log(`  ${command}`);
  console.log(`  ${color.bold("bun run dev")}\n`);
}

export async function askForNextStep(): Promise<ProjectAction | undefined> {
  const selection = await prompts.select<ProjectAction>({
    message: "What's next?",
    initialValue: "open",
    withGuide: false,
    showInstructions: false,
    options: [
      { value: "open", label: "Open project directory" },
      { value: "run", label: "Open and run project", hint: "start dev server" },
    ],
  });
  // Cancelling this menu keeps the completed project ready to use.
  return prompts.isCancel(selection) ? undefined : selection;
}

export function reportError(message: string): void {
  console.error(`\n  ${color.red("×")} ${message}\n`);
}
