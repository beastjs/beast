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

const SUFFIXED_NAME_COMPONENT = [
  "module",
  "  const label$ = \"Ready\";",
  "p #{label$}",
].join("\n");

function transformWithVite(source: string, filename: string, options: Parameters<typeof beastVite>[0] = {}): string {
  const plugin = beastVite(options);
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
  const result = hooks.transform(source, resolve(`tests/fixtures/${filename}`), { ssr: false });
  if (result === null) throw new Error("Vite declined to transform BTSX.");
  return result.code;
}

describe("Octane compiler option forwarding", () => {
  const knownAttributeSpreads = [{
    source: "@example/styles",
    imported: "props",
    fields: ["className", "style"],
    style: "object" as const,
    jsxAttribute: "sx",
  }];

  test("Vite lowers native sx with the configured attribute factory", () => {
    const code = transformWithVite(
      'import { props } from "@example/styles";\ndiv(sx={{ color: "red" }})',
      "NativeStyles.btsx",
      { octane: { knownAttributeSpreads } },
    );
    expect(code).toContain('props({ color: "red" })');
    expect(code).not.toContain('"sx"');
  });

  test("Vite detects native signal reads from an octane/signals import", () => {
    expect(transformWithVite(NATIVE_SIGNAL_COMPONENT, "NativeSignal.btsx"))
      .toContain("enableNativeReadCollection");
  });

  test("Vite leaves $-suffixed names alone without an octane/signals import", () => {
    expect(transformWithVite(SUFFIXED_NAME_COMPONENT, "SuffixedName.btsx"))
      .not.toContain("enableNativeReadCollection");
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

  test("Rspack forwards only loader options Octane accepts", () => {
    const compiler = {
      options: {
        context: resolve("."),
        resolve: {},
        module: { rules: [] as RuleSetRule[] },
      },
    } as unknown as Compiler;

    new BeastRspackPlugin({ octane: { strong: true, parallel: true, knownAttributeSpreads } }).apply(compiler);

    const rule = compiler.options.module.rules.at(-1) as {
      use: Array<{ options: { octane: Record<string, unknown> } }>;
    };
    expect(rule.use[0]?.options.octane).toEqual({ strong: true, knownAttributeSpreads });
  });

  test("Rsbuild passes Strong mode to its generated BTSX plugin", async () => {
    const plugin = beastRsbuild({ octane: { strong: true } });
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
    expect(beastPlugin.options.octane?.strong).toBe(true);
  });
});
