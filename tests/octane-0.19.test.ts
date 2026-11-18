import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "octane/compiler";
import { renderToString } from "octane/server";
import { BeastCompileError, compileBeastResult, mapGeneratedError } from "../src/index.js";

const MODES = ["client", "server"] as const;

async function loadServer(source: string) {
  let code = compile(compileBeastResult(source).code, "Upgrade19.tsrx", {
    mode: "server", hmr: false, dev: false,
  }).code;
  for (const specifier of ["octane/internal/server", "octane/server", "octane"]) {
    const resolved = JSON.stringify(import.meta.resolve(specifier));
    code = code.replaceAll(JSON.stringify(specifier), resolved).replaceAll(`'${specifier}'`, resolved);
  }
  const directory = await mkdtemp(resolve(tmpdir(), "beast-octane-19-"));
  try {
    const file = resolve(directory, "Upgrade19.mjs");
    await writeFile(file, code);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function mappedFailure(source: string, mode: (typeof MODES)[number]): BeastCompileError {
  const beast = compileBeastResult(source, { filename: "Upgrade19.btsx" });
  let failure: unknown;
  try {
    compile(beast.code, "Upgrade19.tsrx", { mode, hmr: false });
  } catch (error) {
    failure = mapGeneratedError(error, beast.map, source, "Upgrade19.btsx", beast.code);
  }
  expect(failure).toBeInstanceOf(BeastCompileError);
  return failure as BeastCompileError;
}

describe("Octane 0.19 BTSX compatibility", () => {
  test.each(MODES)("compiled modules drop \"use strong\" but keep other directives (%s)", mode => {
    const source = [
      'module "use client";',
      'module "use strong";',
      "props { label }: { label: string }",
      "p #{label}",
    ].join("\n");
    const result = compile(compileBeastResult(source).code, "Directive19.tsrx", { mode, hmr: false, dev: false });
    expect(result.diagnostics).toEqual([]);
    expect(result.code.trimStart().startsWith('"use client";')).toBe(true);
    expect(result.code).not.toContain('"use strong"');
  });

  test.each(MODES)("lone interpolations in directive arms compile as fragments (%s)", mode => {
    const source = [
      "props { ok, items, kind, children }: { ok: boolean; items: string[]; kind: string; children: any }",
      "if ok",
      "  | #{children}",
      "else",
      "  | #{String(items.length)}",
      "each item in items",
      "  | #{item}",
      "empty",
      "  | #{kind}",
      "switch kind",
      "  case \"a\"",
      "    | #{kind}",
      "try",
      "  | #{children}",
      "catch (error)",
      "  | #{String(error)}",
    ].join("\n");
    const tsrx = compileBeastResult(source).code;
    expect(tsrx).toContain("<>{children}</>");
    expect(compile(tsrx, "Arms19.tsrx", { mode, hmr: false }).diagnostics).toEqual([]);
  });

  test("a try arm renders a lone children interpolation on the server", async () => {
    const module = await loadServer([
      "props { children }: { children: any }",
      "try",
      "  | #{children}",
      "catch",
      "  p Failed.",
    ].join("\n"));
    const html = renderToString(module.default, { children: "Rendered child" }).html;
    expect(html).toContain("Rendered child");
    expect(html).not.toContain("Failed.");
  });

  test.each(MODES)("keeps Octane's stable error code on the authored line (%s)", mode => {
    const source = [
      'import { useState } from "octane";',
      "props { items }: { items: string[] }",
      "setup",
      "  for (const item of items) { useState(item); }",
      "p Rows",
    ].join("\n");
    const failure = mappedFailure(source, mode);
    expect(failure.diagnostic.code).toBe("BEAST9001_OCTANE");
    expect(failure.diagnostic.message.startsWith("OCTANE_HOOK_IN_LOOP: ")).toBe(true);
    expect(failure.message).not.toContain("Upgrade19.tsrx");
    expect(failure.diagnostic.span.start.line).toBe(4);
  });

  test.each(MODES)("maps OCTANE_STRONG_READ_ONLY_STATE and accepts useInitialValue (%s)", mode => {
    const rejected = [
      'module "use strong";',
      'import { useState } from "octane";',
      "setup const [snapshot] = useState(0);",
      "p #{snapshot}",
    ].join("\n");
    const failure = mappedFailure(rejected, mode);
    expect(failure.message).toContain("OCTANE_STRONG_READ_ONLY_STATE");
    expect(failure.diagnostic.span.start.line).toBe(3);

    const accepted = [
      'module "use strong";',
      'import { useInitialValue } from "octane";',
      "setup const snapshot = useInitialValue(0);",
      "p #{snapshot}",
    ].join("\n");
    expect(compile(compileBeastResult(accepted).code, "Initial19.tsrx", { mode, hmr: false }).diagnostics).toEqual([]);
  });

  test.each(MODES)("drops an import used only as a type (%s)", mode => {
    const source = [
      'import { Icon } from "./Icons";',
      "props { icon }: { icon: Icon }",
      "p #{String(icon)}",
    ].join("\n");
    const result = compile(compileBeastResult(source).code, "TypeImport19.tsrx", { mode, hmr: false, dev: false });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).not.toContain("./Icons");
  });
});
