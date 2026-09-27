import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { compile } from "octane/compiler";
import { compileBeastResult, mapGeneratedError, BeastCompileError } from "../src/index.js";

function lower(source: string, options: Parameters<typeof compile>[2] = {}) {
  const beast = compileBeastResult(source, { filename: "Upgrade.btsx" });
  return compile(beast.code, "Upgrade.tsrx", { hmr: false, dev: false, ...options });
}

describe("Octane 0.6 BTSX compatibility", () => {
  test("tracked ref example uses compatibility mode for explicit memo hooks", async () => {
    const markdown = await readFile(new URL("../skills/react-to-beast/references/refs-context-boundaries.md", import.meta.url), "utf8");
    const source = /```btsx\n([\s\S]*?)```/u.exec(markdown)?.[1];
    expect(source).toBeDefined();
    for (const mode of ["client", "server"] as const) {
      const result = lower(source!, { mode });
      expect(result.diagnostics.filter((diagnostic) => diagnostic.severity !== "hint")).toEqual([]);
    }
  });

  test("universal renderers lower setup-bearing scopes inside control flow", () => {
    const result = lower([
      'import { useState } from "octane";',
      'props { visible }: { visible: boolean }',
      'if visible',
      '  scope',
      '    setup const [count, setCount] = useState(0);',
      '    button(onClick={() => setCount(count + 1)}) #{count}',
    ].join('\n'), { renderer: { id: "native", target: "universal", text: "host", module: "octane/universal/native" }, universalRuntime: { runtime: "native", thread: "main-thread" } });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("universalBlock");
    expect(result.code).not.toContain("createElementFromConfig");
  });

  test("universal JSX prop values stay on the universal runtime", () => {
    const result = lower('setup const card = <span>Card</span>;\nPanel(card={card})', {
      renderer: { id: "native", target: "universal", text: "host", module: "octane/universal/native" }, universalRuntime: { runtime: "native", thread: "main-thread" },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("universalValue");
    expect(result.code).not.toContain("createScopedValue");
    expect(result.code).not.toContain("createElementFromConfig");
  });

  test.each(["client", "server"] as const)("spread children report authored BTSX locations (%s)", (mode) => {
    const source = 'props { items }: { items: unknown[] }\nscope\n  setup const bad = <span>{...items}</span>;';
    const beast = compileBeastResult(source, { filename: "Upgrade.btsx" });
    try {
      compile(beast.code, "Upgrade.tsrx", { mode, hmr: false });
      throw new Error("Expected unsupported spread child diagnostic");
    } catch (error) {
      const mapped = mapGeneratedError(error, beast.map, source, "Upgrade.btsx");
      expect(mapped).toBeInstanceOf(BeastCompileError);
      expect((mapped as BeastCompileError).diagnostic.span.start.line).toBe(3);
      expect((mapped as Error).message).toMatch(/spread/i);
    }
  });

  test.each(["client", "server"] as const)("assigned styles retain element and descendant rules (%s)", (mode) => {
    const result = lower([
      'module',
      '  const styles = <style>',
      '    .card { color: red; }',
      '    button { padding: 1px; }',
      '    .card span { color: blue; }',
      '  </style>;',
      'button(className={styles.card})',
      '  span Label',
    ].join('\n'), { mode });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("padding: 1px");
    expect(result.code).toContain("color: blue");
  });

  test("native form capture opt-in attributes survive server compilation", () => {
    const result = lower('form(data-octane-capture-submit="save" method="post")\n  input(name="title")\n  button(type="submit" name="intent" value="save") Save', { mode: "server" });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain('data-octane-capture-submit');
    expect(result.code).toContain('intent');
  });
});
