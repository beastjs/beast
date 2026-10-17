import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "octane/compiler";
import { renderToString } from "octane/server";
import { createResource, createScope, query } from "octane/signals";
import { BeastCompileError, compileBeastResult, mapGeneratedError } from "../src/index.js";

const MODES = ["client", "server"] as const;

async function loadServer(source: string) {
  let code = compile(compileBeastResult(source).code, "Upgrade13.tsrx", {
    mode: "server", hmr: false, dev: false,
  }).code;
  for (const specifier of ["octane/internal/server", "octane/server", "octane/signals"]) {
    const resolved = JSON.stringify(import.meta.resolve(specifier));
    code = code.replaceAll(JSON.stringify(specifier), resolved).replaceAll(`'${specifier}'`, resolved);
  }
  const directory = await mkdtemp(resolve(tmpdir(), "beast-octane-13-"));
  try {
    const file = resolve(directory, "Upgrade13.mjs");
    await writeFile(file, code);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Octane 0.13 BTSX compatibility", () => {
  test.each([
    ['<strong title="text )">inline</strong>', "inline"],
    ['<><span>{/\\)/.test(")") ? "regex" : "no"}</span><em>tail</em></>', "regex"],
    ['@if (true) { <span>branch</span> } @else { <i /> }', "branch"],
  ])("inline render props preserve markup and embedded JavaScript: %s", async (body, text) => {
    const module = await loadServer([
      'module "use strong";',
      'module',
      '  function Slot(props) @{ <section>{props.content}</section> }',
      `Slot(content={@{ ${body} }})`,
    ].join("\n"));
    expect(renderToString(module.default).html).toContain(text!);
  });

  test.each(MODES)("Strong keyed fragments, component spreads, and inline render props compile without descriptors (%s)", mode => {
    const source = [
      'module "use strong";',
      'import { Fragment } from "octane";',
      'module',
      '  function Child(props) @{ <p>{props.label as string}</p> }',
      '  function Slot(props) @{ <section>{props.content}</section> }',
      'props { id, bag }',
      'Fragment(key={id})',
      '  Child({...bag} key={id})',
      '  Slot(content={@{ <strong>inline</strong> }})',
    ].join("\n");
    const result = compile(compileBeastResult(source).code, "Keyed13.tsrx", { mode, hmr: false, dev: false });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).not.toMatch(/\b(?:createElement|jsx|jsxs)\s+as\s/u);
  });

  test.each(MODES)("Strong useMemo and useCallback are accepted (%s)", mode => {
    const source = [
      'module "use strong";',
      'import { useMemo, useCallback } from "octane";',
      'props { label }: { label: string }',
      'setup',
      '  const value = useMemo(() => label.toUpperCase(), [label]);',
      '  const read = useCallback(() => value, [value]);',
      'p #{read()}',
    ].join("\n");
    expect(compile(compileBeastResult(source).code, "Memo13.tsrx", { mode, hmr: false }).diagnostics).toEqual([]);
  });

  for (const mode of MODES) {
    test.each([
      ["OCTANE_STRONG_ELEMENT_API", [
        'module "use strong";',
        'import { createElement } from "octane";',
        'p #{createElement("span", null, "descriptor")}',
      ].join("\n")],
      ["OCTANE_STRONG_SINGLE_ITEM_FOR", [
        'module "use strong";',
        'props { id }',
        'each item in [id] key item',
        '  p #{item}',
      ].join("\n")],
    ])(`maps %s to authored BTSX (${mode})`, (code, source) => {
      const beast = compileBeastResult(source!, { filename: "Strong13.btsx" });
      let failure: unknown;
      try {
        compile(beast.code, "Strong13.tsrx", { mode, hmr: false });
      } catch (error) {
        failure = mapGeneratedError(error, beast.map, source!, "Strong13.btsx", beast.code);
      }
      expect(failure).toBeInstanceOf(BeastCompileError);
      const mapped = failure as BeastCompileError;
      expect(mapped.message).toContain(code!);
      expect(mapped.message).not.toContain("Strong13.tsrx");
      expect(mapped.diagnostic.span.start.line).toBeGreaterThanOrEqual(1);
      expect(mapped.diagnostic.span.start.line).toBeLessThanOrEqual(source!.split("\n").length);
    });
  }

  test.each(["pending", "error"])("server snapshots of %s queries add no invented ready seed after signal modules load", async status => {
    const module = await loadServer([
      'import { signal$ } from "octane/signals";',
      'module',
      '  const label$ = signal$("installed");',
      '  export function Install() @{ <p>{label$.get() as string}</p> }',
      'props { resource }',
      'output #{resource.snapshot().status as string}',
    ].join("\n"));
    expect(renderToString(module.Install).html).toContain("installed");
    const scope = createScope({ scopeKey: `beast-13-${status}` });
    const load = query(`beast-13-${status}-query`, () => status === "error"
      ? Promise.reject(new Error("failed"))
      : new Promise<string>(() => {}));
    const resource = createResource(scope, "resource", () => load(undefined));
    try {
      if (status === "error") {
        const { act } = await import("octane");
        await act(() => {});
      }
      const result = renderToString(module.default, { resource });
      expect(result.html).toContain(`<output>${status}</output>`);
      expect(result.html).not.toContain("data-octane-native-signals");
    } finally {
      scope.dispose();
    }
  });
});
