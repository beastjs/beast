import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { Compiler, RuleSetRule } from "@rspack/core";
import { beast as beastRsbuild } from "../src/rsbuild.js";
import { BeastRspackPlugin } from "../src/rspack.js";
import { beast as beastVite } from "../src/vite.js";

const NATIVE_SIGNAL_COMPONENT = [
  'import { createScope } from "octane/signals";',
  "module",
  '  const scope = createScope({ scopeKey: "beast-native-read" });',
  '  const count$ = scope.signal$("count", 0);',
  "p #{String(scope.get(count$))}",
].join("\n");

describe("Octane compiler option forwarding", () => {
  test("Vite enables native reads in the compiler for generated BTSX", () => {
    const plugin = beastVite({ octane: { nativeReads: true } });
    const hooks = plugin as unknown as {
      configResolved(config: {
        root: string;
        command: "build";
        logger: { warn(message: string): void };
      }): void;
      transform(
        source: string,
        id: string,
        options: { ssr: boolean },
      ): { code: string } | null;
    };
    hooks.configResolved({
      root: resolve("."),
      command: "build",
      logger: { warn: () => {} },
    });

    const result = hooks.transform(
      NATIVE_SIGNAL_COMPONENT,
      resolve("tests/fixtures/NativeSignal.btsx"),
      { ssr: false },
    );

    expect(result?.code).toContain("enableNativeReadCollection");
  });

  test("Vite mirrors Octane's HMR, profile, SSR, and renderer controls", () => {
    const transform = (
      octane: Parameters<typeof beastVite>[0]["octane"],
      command: "build" | "serve",
      source = "p Ready",
    ): string => {
      const plugin = beastVite({ octane });
      const hooks = plugin as unknown as {
        configResolved(config: {
          root: string;
          command: "build" | "serve";
          logger: { warn(message: string): void };
        }): void;
        transform(
          sourceText: string,
          id: string,
          options: { ssr: boolean },
        ): { code: string } | null;
      };
      hooks.configResolved({
        root: resolve("."),
        command,
        logger: { warn: () => {} },
      });
      const result = hooks.transform(
        source,
        resolve("tests/fixtures/ViteOptions.btsx"),
        { ssr: false },
      );
      if (result === null) throw new Error("Vite declined to transform BTSX.");
      return result.code;
    };

    expect(transform({ hmr: false }, "serve")).not.toContain("import.meta.hot");
    expect(transform({ profile: "auto" }, "serve")).toContain("octane/profiling");
    expect(transform({ ssr: true }, "build")).not.toContain("from 'octane'");
    expect(transform({
      renderers: {
        registry: {
          native: {
            module: "@test/native",
            target: "universal",
            server: "unsupported",
            text: "ignore",
          },
        },
        default: "native",
      },
    }, "build", "view")).toContain("from '@test/native'");
  });

  test("Rspack retains nativeReads in the Beast loader options", () => {
    const compiler = {
      options: {
        context: resolve("."),
        resolve: {},
        module: { rules: [] as RuleSetRule[] },
      },
    } as unknown as Compiler;

    new BeastRspackPlugin({ octane: { nativeReads: true } }).apply(compiler);

    const rule = compiler.options.module.rules.at(-1) as {
      use: Array<{ options: { octane: { nativeReads?: boolean } } }>;
    };
    expect(rule.use[0]?.options.octane.nativeReads).toBe(true);
  });

  test("Rsbuild passes nativeReads to its generated BTSX plugin", async () => {
    const plugin = beastRsbuild({ octane: { nativeReads: true } });
    let modify:
      | ((config: { plugins?: unknown[] }) => { plugins?: unknown[] })
      | undefined;
    const setup = plugin.setup as unknown as (api: {
      context: { rootPath: string };
      modifyRspackConfig(
        callback: (config: { plugins?: unknown[] }) => { plugins?: unknown[] },
      ): void;
    }) => Promise<void>;

    await setup({
      context: { rootPath: resolve(".") },
      modifyRspackConfig: (callback) => {
        modify = callback;
      },
    });
    if (modify === undefined) throw new Error("Rsbuild did not register a Rspack modifier.");

    const config = modify({ plugins: [] });
    const beastPlugin = config.plugins?.at(-1) as BeastRspackPlugin;
    expect(beastPlugin.options.octane?.nativeReads).toBe(true);
  });
});
