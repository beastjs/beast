import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "octane/compiler";
import { renderToString } from "octane/server";
import { BeastCompileError, compileBeastResult, mapGeneratedError } from "../src/index.js";

const MODES = ["client", "server"] as const;

async function loadModule(code: string) {
  for (const specifier of ["octane/internal/client", "octane/internal/server", "octane/server", "octane"]) {
    const resolved = JSON.stringify(import.meta.resolve(specifier));
    code = code.replaceAll(JSON.stringify(specifier), resolved).replaceAll(`'${specifier}'`, resolved);
  }
  const directory = await mkdtemp(resolve(tmpdir(), "beast-octane-12-"));
  try {
    const file = resolve(directory, "Upgrade12.mjs");
    await writeFile(file, code);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Octane 0.12 BTSX compatibility", () => {
  test("literal comment markers and decoded entities survive the TSRX parser", async () => {
    const source = [
      'section',
      '  p before // after',
      '  p // literal start',
      '  p(title="&amp;lt;") A &amp;lt; B',
      '  a(href="https://example.com/?a=1&amp;b=2") https://example.com/a//b',
    ].join("\n");
    const beast = compileBeastResult(source);
    expect(beast.code).toContain("{'before // after'}");
    expect(beast.code).toContain('<p title={"&lt;"}>');
    expect(compile(beast.code, "Text12.tsrx", { mode: "client", hmr: false }).diagnostics).toEqual([]);
    const module = await loadModule(compile(beast.code, "Text12.tsrx", { mode: "server", hmr: false }).code);
    const html = renderToString(module.default).html;
    expect(html).toContain("before // after");
    expect(html).toContain("// literal start");
    expect(html).toContain('title="&amp;lt;"');
    expect(html).toContain("A &amp;lt; B");
    expect(html).toContain("https://example.com/a//b");
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
  });

  test.each(["ts", "mts", "cts"])("erases types and preserves parameter properties in native .%s modules", async extension => {
    const source = [
      'import type { Missing } from "./types.mjs";',
      'import { type AlsoMissing } from "./types.mjs";',
      'export type { Missing } from "./types.mjs";',
      'export type * from "./types.mjs";',
      'export { AlsoMissing };',
      'export class Value {',
      '  declare absent: Missing;',
      '  constructor(public value: string) {}',
      '}',
      'export const asserted = <string>"typed";',
    ].join("\n");
    const result = compile(source, `Native12.${extension}`, { hmr: false, dev: false });
    expect(result.diagnostics).toEqual([]);
    const module = await loadModule(result.code);
    const value = new module.Value("kept");
    expect(value.value).toBe("kept");
    expect(Object.hasOwn(value, "absent")).toBe(false);
    expect(module.asserted).toBe("typed");
    expect("AlsoMissing" in module).toBe(false);
  });

  test.each(MODES)("erases generic superclasses and type-only re-exports from module blocks (%s)", async mode => {
    const source = [
      'import type { Missing } from "./types.mjs";',
      'module',
      '  export { Missing };',
      '  class Base<T> { constructor(public value: T) {} }',
      '  export class Derived extends Base<string> { declare absent: Missing; }',
      'p #{new Derived("kept").value}',
    ].join("\n");
    const result = compile(compileBeastResult(source).code, "Types12.tsrx", { mode, hmr: false, dev: false });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).not.toContain("extends Base<string>");
    // Loading the output proves the type-only import/export cannot fail to link.
    const module = await loadModule(result.code);
    const value = new module.Derived("kept");
    expect(value.value).toBe("kept");
    expect(Object.hasOwn(value, "absent")).toBe(false);
    expect("Missing" in module).toBe(false);
    if (mode === "server") expect(renderToString(module.default).html).toContain("kept");
  });

  test("useLazyRef initializes on the server while useLayoutSnapshot uses its initial value", async () => {
    const source = [
      'import { useLazyRef, useLayoutSnapshot } from "octane";',
      'props { make, measure }: { make: () => unknown; measure: () => string }',
      'setup',
      '  useLazyRef(make);',
      '  const snapshot = useLayoutSnapshot(measure, { initial: "server" });',
      'output #{snapshot}',
    ].join("\n");
    const tsrx = compileBeastResult(source).code;
    expect(compile(tsrx, "Hooks12.tsrx", { mode: "client", hmr: false }).diagnostics).toEqual([]);
    const module = await loadModule(compile(tsrx, "Hooks12.tsrx", { mode: "server", hmr: false }).code);
    let factories = 0;
    const html = renderToString(module.default, {
      make: () => { factories++; return {}; },
      measure: () => { throw new Error("Server must not measure the DOM"); },
    }).html;
    expect(html).toContain("server");
    expect(factories).toBe(1);
  });

  test.each(MODES)("accepts state getters and value refs in Strong effect setup (%s)", mode => {
    const source = [
      'module "use strong";',
      'import { useEffect, useRef, useState } from "octane";',
      'setup',
      '  const [count, , getCount] = useState(0);',
      '  const value = useRef(0);',
      '  useEffect(() => { value.current = getCount(); });',
      'p #{count}',
    ].join("\n");
    expect(compile(compileBeastResult(source).code, "Effects12.tsrx", { mode, hmr: false }).diagnostics).toEqual([]);
  });

  for (const mode of MODES) {
    test.each([
      ["OCTANE_STRONG_REF_STATE_UPDATE", [
        'const [count, setCount] = useState(0);',
        'const ref = () => setCount(current => current + 1);',
      ], 'button(ref={ref}) #{count}'],
      ["OCTANE_STRONG_LAYOUT_SNAPSHOT_ASYNC", [
        'const snapshot = useLayoutSnapshot(async () => "measured", { initial: "server" });',
      ], 'output #{snapshot}'],
    ] as const)(`maps %s to the authored BTSX line (${mode})`, (code, setup, template) => {
      const source = [
        'module "use strong";',
        'import { useState, useLayoutSnapshot } from "octane";',
        'setup',
        ...setup.map(line => `  ${line}`),
        template,
      ].join("\n");
      const beast = compileBeastResult(source, { filename: "Strong12.btsx" });
      let failure: unknown;
      try {
        compile(beast.code, "Strong12.tsrx", { mode, hmr: false });
      } catch (error) {
        failure = mapGeneratedError(error, beast.map, source, "Strong12.btsx", beast.code);
      }
      expect(failure).toBeInstanceOf(BeastCompileError);
      const mapped = failure as BeastCompileError;
      expect(mapped.message).toContain(code);
      expect(mapped.message).not.toContain("Strong12.tsrx");
      expect(mapped.diagnostic.span.start.line).toBeGreaterThanOrEqual(4);
      expect(mapped.diagnostic.span.start.line).toBeLessThanOrEqual(source.split("\n").length);
    });
  }

  test("recursive DOM-binding views compile and server-render finite data", async () => {
    const source = [
      'module',
      '  export function Tree({ node }) @{',
      '    "use dom bindings";',
      '    <section>',
      '      <span>{node.label as string}</span>',
      '      @for (const child of node.children; key child.key) { <Tree node={child} /> }',
      '    </section>',
      '  }',
      'props { node }',
      'Tree(node={node})',
    ].join("\n");
    const beast = compileBeastResult(source);
    expect(compile(beast.code, "Recursive12.tsrx", { mode: "client", hmr: false }).diagnostics).toEqual([]);
    const module = await loadModule(compile(beast.code, "Recursive12.tsrx", { mode: "server", hmr: false }).code);
    const html = renderToString(module.default, {
      node: { label: "root", children: [{ key: "leaf", label: "leaf", children: [] }] },
    }).html;
    expect(html).toContain("root");
    expect(html).toContain("leaf");
    expect(html.match(/<section/g)).toHaveLength(2);
  });
});
