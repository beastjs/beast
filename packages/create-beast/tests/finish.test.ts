import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { runCli, type ProjectAction } from "../src/index.js";

const directories: string[] = [];
const output = spyOn(console, "log").mockImplementation(() => {});
const errors = spyOn(console, "error").mockImplementation(() => {});
afterAll(() => {
  output.mockRestore();
  errors.mockRestore();
});
afterEach(async () => {
  output.mockClear();
  errors.mockClear();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function target(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "beast-finish-test-"));
  directories.push(directory);
  return resolve(directory, "my project");
}

test("CLI previews can use a local compiler tarball before publication", async () => {
  const directory = await target();
  const status = await runCli([directory, "--yes", "--no-install", "--no-git"], {
    compilerSpec: "file:/local/beast-tsrx-demo.tgz",
  });
  expect(status).toBe(0);
  const manifest = await Bun.file(resolve(directory, "package.json")).json();
  expect(manifest.dependencies["beast-tsrx"]).toBe("file:/local/beast-tsrx-demo.tgz");
  expect(manifest.dependencies.octane).toBe("0.12.1");
});

for (const action of ["open", "run"] as const satisfies readonly ProjectAction[]) {
  test(`final ${action} selection waits for UI/icons and enters the project with terminal output`, async () => {
    const directory = await target();
    const commands: { command: string; args: readonly string[]; cwd: string; stdio: string }[] = [];
    const interruptListeners = process.listenerCount("SIGINT");
    const status = await runCli([
      directory, "--no-git", "--beast-ui", "--icons", "--bundler", "vite", "--ui", "base-ui",
    ], {
      runCommand: async (command, args, cwd, stdio) => {
        commands.push({ command, args, cwd, stdio });
        return { code: 0, output: "" };
      },
      selectNextStep: async () => {
        expect(commands.map(({ command, args }) => [command, ...args].join(" "))).toEqual([
          "bun install", "bun run beast-ui init --package-manager bun",
          "bun run beast-ui icons init --framework beast",
        ]);
        return action;
      },
    });
    expect(status).toBe(0);
    const launched = commands.at(-1)!;
    expect(launched.cwd).toBe(directory);
    expect(launched.stdio).toBe("inherit");
    expect(launched.command).toBe(process.platform === "win32"
      ? process.env.ComSpec || "cmd.exe" : process.env.SHELL || "/bin/sh");
    const foregroundCommands = commands.slice(3);
    if (action === "run") {
      expect(foregroundCommands[0]).toEqual({
        command: "bun", args: ["run", "dev"], cwd: directory, stdio: "inherit",
      });
      expect(foregroundCommands).toHaveLength(2);
    } else {
      expect(foregroundCommands).toHaveLength(1);
    }
    expect(process.listenerCount("SIGINT")).toBe(interruptListeners);
  });
}

test("cancelling the final selection keeps the completed project and prints next commands", async () => {
  const directory = await target();
  let launches = 0;
  const status = await runCli([directory, "--no-git"], {
    runCommand: async (command) => {
      if (command !== "bun") launches += 1;
      return { code: 0, output: "" };
    },
    selectNextStep: async () => undefined,
  });
  expect(status).toBe(0);
  expect(launches).toBe(0);
  expect(await Bun.file(resolve(directory, "package.json")).exists()).toBe(true);
  expect(output.mock.calls.flat().join("\n")).toContain("bun run dev");
  expect(errors).not.toHaveBeenCalled();
});

for (const flags of [["--yes"], ["--no-install"]]) {
  test(`${flags[0]} skips the final selection and shell launch`, async () => {
    const directory = await target();
    let commands = 0;
    const status = await runCli([directory, "--no-git", ...flags], {
      runCommand: async (command, args) => {
        expect(command).toBe("bun");
        expect(args).toEqual(["install"]);
        commands += 1;
        return { code: 0, output: "" };
      },
      selectNextStep: async () => { throw new Error("Should not offer a final selection"); },
    });
    expect(status).toBe(0);
    expect(commands).toBe(flags.includes("--no-install") ? 0 : 1);
    expect(output.mock.calls.flat().join("\n")).toContain("bun run dev");
  });
}

for (const failingPhase of ["install", "init"]) {
  test(`failed ${failingPhase} does not offer the final selection`, async () => {
    const directory = await target();
    const status = await runCli([directory, "--no-git", "--beast-ui"], {
      runCommand: async (_command, args) => ({
        code: args.includes(failingPhase) ? 1 : 0, output: "Setup command failed",
      }),
      selectNextStep: async () => { throw new Error("Must finish setup first"); },
    });
    expect(status).toBe(1);
    expect(errors.mock.calls.flat().join("\n")).toContain("Setup command failed");
  });
}

test("an unavailable project shell preserves the project and restores signal handling", async () => {
  const directory = await target();
  const interruptListeners = process.listenerCount("SIGINT");
  const status = await runCli([directory, "--no-git"], {
    runCommand: async (command) => command === "bun"
      ? { code: 0, output: "" } : { code: null, output: "shell not found" },
    selectNextStep: async () => "open",
  });
  expect(status).toBe(1);
  expect(errors.mock.calls.flat().join("\n")).toContain("Could not open the project shell: shell not found");
  expect(await Bun.file(resolve(directory, "package.json")).exists()).toBe(true);
  expect(process.listenerCount("SIGINT")).toBe(interruptListeners);
});

test("interrupting the development server opens the project shell instead of closing the launcher", async () => {
  const directory = await target();
  const commands: string[] = [];
  const status = await runCli([directory, "--no-git"], {
    runCommand: async (command, args, cwd, stdio) => {
      commands.push([command, ...args].join(" "));
      if (args[0] === "run") {
        expect(process.listenerCount("SIGINT")).toBeGreaterThan(0);
        process.emit("SIGINT");
        return { code: null, output: "" };
      }
      if (command !== "bun") {
        expect(cwd).toBe(directory);
        expect(stdio).toBe("inherit");
      }
      return { code: 0, output: "" };
    },
    selectNextStep: async () => "run",
  });
  expect(status).toBe(0);
  expect(commands[0]).toBe("bun install");
  expect(commands[1]).toBe("bun run dev");
  expect(commands).toHaveLength(3);
});
