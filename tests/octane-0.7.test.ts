import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "octane/compiler";
import { renderToString } from "octane/server";
import { BeastCompileError, compileBeastResult, mapGeneratedError } from "../src/index.js";
import { findScopeReturn } from "../src/scope-return.js";

type Mode = "client" | "server";
const MODES = ["client", "server"] as const;

function lower(source: string, mode: Mode) {
  const beast = compileBeastResult(source, { filename: "Upgrade.btsx" });
  return compile(beast.code, "Upgrade.tsrx", { mode, hmr: false, dev: false });
}

function mappedFailure(source: string, mode: Mode): BeastCompileError {
  const beast = compileBeastResult(source, { filename: "Upgrade.btsx" });
  try {
    compile(beast.code, "Upgrade.tsrx", { mode, hmr: false });
  } catch (error) {
    const mapped = mapGeneratedError(error, beast.map, source, "Upgrade.btsx", beast.code);
    expect(mapped).toBeInstanceOf(BeastCompileError);
    return mapped as BeastCompileError;
  }
  throw new Error("Expected Octane to reject the generated TSRX");
}

async function renderServer(source: string, props: Record<string, unknown>): Promise<string> {
  let code = lower(source, "server").code;
  for (const specifier of ["octane/internal/server", "octane/hydration", "octane/server"]) {
    const resolved = JSON.stringify(import.meta.resolve(specifier));
    code = code.replaceAll(JSON.stringify(specifier), resolved).replaceAll(`'${specifier}'`, resolved);
  }
  const directory = await mkdtemp(resolve(tmpdir(), "beast-octane-07-"));
  const modulePath = resolve(directory, "Upgrade.mjs");
  try {
    await writeFile(modulePath, code, "utf8");
    const module = (await import(pathToFileURL(modulePath).href)) as {
      default: Parameters<typeof renderToString>[0];
    };
    return renderToString(module.default, props as never).html;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Octane 0.7 BTSX compatibility", () => {
  test.each(MODES)("continue inside a scope block maps to the authored line (%s)", (mode) => {
    const failure = mappedFailure([
      "props { items }: { items: string[] }",
      "ul",
      "  each item in items key item",
      "    scope",
      "      setup if (!item) continue;",
      "      li #{item}",
    ].join("\n"), mode);
    expect(failure.diagnostic.span.start.line).toBe(5);
    expect(failure.message).toMatch(/cannot leave a `@\{ … \}` block/u);
  });

  test.each(MODES)("textarea element children map to the authored line (%s)", (mode) => {
    const failure = mappedFailure("form\n  textarea(name=\"bio\")\n    span Bad", mode);
    expect(failure.diagnostic.span.start.line).toBe(3);
    expect(failure.message).toMatch(/textarea>` children must be text/u);
    expect(failure.message).not.toMatch(/Upgrade\.tsrx/u);
  });

  test("textarea interpolation renders one run of text without hydration markers", async () => {
    const source = 'props { name }: { name: string }\ntextarea(name="bio") Hello #{name}';
    expect(lower(source, "client").diagnostics).toEqual([]);
    const html = await renderServer(source, { name: "Ada" });
    expect(html).toContain(">Hello Ada</textarea>");
    expect(html).not.toContain("<!--");
  });

  test.each(MODES)("use strong inside setup reports a placement error (%s)", (mode) => {
    const failure = mappedFailure('setup\n  "use strong";\n  const x = 1;\np #{x}', mode);
    expect(failure.diagnostic.span.start.line).toBe(2);
    expect(failure.message).toContain("OCTANE_STRONG_DIRECTIVE_PLACEMENT");
  });

  test("Object.assign compound components keep directive bodies", async () => {
    const source = [
      "component Item",
      "  props { label }: { label: string }",
      "  if label",
      "    li #{label}",
      "  else",
      "    li.empty Untitled",
      "module",
      "  const Menu = Object.assign(Item, { Item });",
      "ul",
      '  Menu.Item(label="Open")',
      '  Menu.Item(label="")',
    ].join("\n");
    expect(lower(source, "client").diagnostics).toEqual([]);
    const html = await renderServer(source, {});
    expect(html).toContain(">Open</li>");
    expect(html).toContain(">Untitled</li>");
  });
});

describe("return inside a scope", () => {
  const wrap = (setup: string) => [
    "props { items }: { items: string[] }",
    "ul",
    "  each item in items key item",
    "    scope",
    "      setup",
    ...setup.split("\n").map((line) => `        ${line}`),
    "      li #{item}",
  ].join("\n");

  const rejected = [
    "if (!item) return;",
    "if (!item) { return; }",
    "if (item.length > 1) { if (item === 'x') { return; } }",
    "switch (item) { case 'a': return; }",
    "try { return; } finally {}",
    "try {} catch { return; }",
    "if (item) {} else return;",
    "{ return; }",
    "for (const c of item) continue;\nif (!item) return;",
    "do {} while (!item);\nreturn;",
  ];
  const accepted = [
    "const f = () => { return item; };",
    "function g() { return item; }",
    "const o = { m() { return 1; }, n: function () { return 2; } };",
    "class K { get v() { return 1; } }",
    "const s = 'return'; const t = `${(() => { return 1; })()} return`;",
    "// return\n/* return */ const r = /return/u;",
    "const v = item.length / 2; const w = { return: 1 }.return;",
    "const h = [1].map((x) => { if (x) { return x; } return 0; });",
    "for (const c of item) { if (c === 'x') return; }",
    "for (const c of item) return;",
    "while (item.length > 3) { return; }",
    "do { return; } while (!item);",
    "if (item) { for (;;) { return; } }",
  ];

  test.each(rejected)("reports %p at the return keyword", (setup) => {
    const source = wrap(setup);
    let error: unknown;
    try {
      compileBeastResult(source, { filename: "Upgrade.btsx" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BeastCompileError);
    const { diagnostic } = error as BeastCompileError;
    expect(diagnostic.code).toBe("BEAST1904_SCOPE_RETURN");
    expect(source.slice(diagnostic.span.start.offset, diagnostic.span.end.offset)).toBe("return");
    // Beast only claims what Octane itself rejects: compile the same TSRX with
    // the bare return swapped back in after Beast's check.
    const marker = "__beast_return__";
    const offset = findScopeReturn(setup)!;
    const probe = `${setup.slice(0, offset)}${marker}${setup.slice(offset + "return".length)}`;
    const tsrx = compileBeastResult(wrap(probe), { filename: "Probe.btsx" }).code.replace(marker, "return");
    for (const mode of MODES) {
      expect(() => compile(tsrx, "P.tsrx", { mode, hmr: false })).toThrow(/authored return boundary/u);
    }
  });

  test.each(accepted)("leaves %p to Octane", (setup) => {
    expect(findScopeReturn(setup)).toBeNull();
    const beast = compileBeastResult(wrap(setup), { filename: "Upgrade.btsx" });
    for (const mode of MODES) {
      expect(() => compile(beast.code, "Upgrade.tsrx", { mode, hmr: false })).not.toThrow();
    }
  });

  test("component setup keeps its early return", () => {
    const beast = compileBeastResult("props { x }: { x: boolean }\nsetup if (!x) return;\np Ready", {
      filename: "Upgrade.btsx",
    });
    expect(compile(beast.code, "Upgrade.tsrx", { mode: "client", hmr: false }).diagnostics).toEqual([]);
  });
});
