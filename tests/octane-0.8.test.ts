import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";
import { compile } from "octane/compiler";
import { renderToString } from "octane/server";
import { BeastCompileError, compileBeastResult, mapGeneratedError } from "../src/index.js";

const MODES = ["client", "server"] as const;
const strong = (setup: string[], template = 'button(onClick={update}) #{count}') => [
  "module",
  '  "use strong";',
  'import { useState, useEffect, useRef, useSyncExternalStore } from "octane";',
  "setup",
  ...setup.map(line => `  ${line}`),
  template,
].join("\n");

const INVALID_STRONG = [
  ["OCTANE_STRONG_IMPURE_UPDATER", strong([
    "const [count, setCount] = useState(0);",
    "const update = () => setCount(current => current + Math.random());",
  ])],
  ["OCTANE_STRONG_SNAPSHOT_MUTATION", strong([
    "const [items, setItems] = useState([1]);",
    "const update = () => { items.push(2); setItems(items); };",
  ], 'button(onClick={update}) #{items.length}')],
  ["OCTANE_STRONG_STALE_STATE_UPDATE", strong([
    "const [count, setCount] = useState(0);",
    "const update = () => { setTimeout(() => setCount(count + 1), 10); };",
  ])],
  ["OCTANE_STRONG_UNCACHED_STORE_SNAPSHOT", strong([
    "const value = useSyncExternalStore(() => () => {}, () => ({ count: 1 }), () => ({ count: 1 }));",
  ], "p #{value.count}")],
  ["OCTANE_STRONG_WRITE_ONLY_STATE", strong([
    "const [, setCount] = useState(0);",
    "const update = () => setCount(current => current + 1);",
  ], 'button(onClick={update}) Refresh')],
  ["OCTANE_STRONG_EFFECT_RESOURCE_LEAK", strong([
    'useEffect(() => { setInterval(() => console.log("tick"), 1000); }, []);',
  ], "p Clock")],
  ["OCTANE_STRONG_EFFECT_HIDDEN_DEPENDENCY", strong([
    "const [count, , getCount] = useState(0);",
    "useEffect(() => { console.log(getCount()); }, []);",
  ], "p #{count}")],
  ["OCTANE_STRONG_MANAGED_DOM_WRITE", strong([
    "const node = useRef<HTMLParagraphElement | null>(null);",
    'const update = () => { if (node.current) node.current.textContent = "changed"; };',
  ], 'p(ref={node}) Original\nbutton(onClick={update}) Change')],
  ["OCTANE_STRONG_RAW_HTML_WRITE", strong([
    "const node = useRef<HTMLParagraphElement | null>(null);",
    'const update = () => { if (node.current) node.current.innerHTML = "<b>changed</b>"; };',
  ], 'p(ref={node}) Original\nbutton(onClick={update}) Change')],
  ["OCTANE_STRONG_OWN_MARKUP_QUERY", strong([
    'const update = () => document.querySelector("#owned");',
  ], 'p#owned Original\nbutton(onClick={update}) Inspect')],
  ["OCTANE_STRONG_RENDER_SIDE_EFFECT", strong([
    "const timer = setTimeout(() => {}, 10);",
  ], "p #{timer}")],
] as const;

async function serverModule(source: string, dev = false, modules: Record<string, string> = {}) {
  const beast = compileBeastResult(source, { filename: "Upgrade08.btsx" });
  const result = compile(beast.code, "Upgrade08.tsrx", { mode: "server", hmr: false, dev });
  expect(result.diagnostics).toEqual([]);
  let code = result.code;
  for (const specifier of ["octane/internal/server", "octane/hydration", "octane/signals", "octane/server"]) {
    const resolved = JSON.stringify(import.meta.resolve(specifier));
    code = code.replaceAll(JSON.stringify(specifier), resolved).replaceAll(`'${specifier}'`, resolved);
  }
  const directory = await mkdtemp(resolve(tmpdir(), "beast-octane-08-"));
  try {
    for (const [name, contents] of Object.entries(modules)) {
      await writeFile(resolve(directory, name), contents);
    }
    const file = resolve(directory, "Upgrade08.mjs");
    await writeFile(file, code);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Octane 0.8 BTSX compatibility", () => {
  for (const mode of MODES) {
    test.each(INVALID_STRONG)(`maps %s to authored BTSX (${mode})`, (diagnostic, source) => {
      const beast = compileBeastResult(source, { filename: "Upgrade08.btsx" });
      let failure: unknown;
      try {
        compile(beast.code, "Upgrade08.tsrx", { mode, hmr: false });
      } catch (error) {
        failure = mapGeneratedError(error, beast.map, source, "Upgrade08.btsx", beast.code);
      }
      expect(failure).toBeInstanceOf(BeastCompileError);
      const mapped = failure as BeastCompileError;
      expect(mapped.message).toContain(diagnostic);
      expect(mapped.message).not.toContain("Upgrade08.tsrx");
      expect(mapped.diagnostic.span.start.line).toBeGreaterThanOrEqual(5);
      expect(mapped.diagnostic.span.start.line).toBeLessThanOrEqual(source.split("\n").length);
      // These new restrictions apply only to Strong modules.
      expect(compile(beast.code.replace('"use strong";', ''), "Compat08.tsrx", { mode, hmr: false }).diagnostics).toEqual([]);
    });
  }

  test.each(MODES)("accepts pure deferred updaters, immutable snapshots, and released effect resources (%s)", mode => {
    const source = strong([
      "const [items, setItems] = useState([1]);",
      "const update = () => { setTimeout(() => setItems(current => [...current, 2]), 10); };",
      'useEffect(() => { const timer = setInterval(() => console.log("tick"), 1000); return () => clearInterval(timer); });',
    ], "button(onClick={update}) #{items.length}");
    expect(compile(compileBeastResult(source).code, "Valid08.tsrx", { mode, hmr: false }).diagnostics).toEqual([]);
  });

  test("zero-argument DOM-binding views support signal reads, boundary arms, and mount-only effects", async () => {
    const source = [
      'import { count$ } from "./State.mjs";',
      'import { useEffect, useLayoutEffect } from "octane";',
      "module",
      "  export function Badge() @{",
      '    "use dom bindings";',
      "    useLayoutEffect(() => () => {}, []);",
      "    useEffect(() => () => {}, []);",
      "    @try { <output>{count$.get() as string}</output> }",
      "    @pending { <p>Loading</p> }",
      "    @catch (error) { <p>{String(error)}</p> }",
      "  }",
      "Badge",
    ].join("\n");
    const beast = compileBeastResult(source);
    const client = compile(beast.code, "Binding08.tsrx", { mode: "client", hmr: false, dev: false });
    expect(client.diagnostics).toEqual([]);
    expect(client.code).toContain("bindPresentationView");
    const module = await serverModule(source, false, {
      'State.mjs': `import { createScope } from ${JSON.stringify(import.meta.resolve("octane/signals"))};\nexport const count$ = createScope({ scopeKey: "beast-08-binding" }).signal$("count", "2");`,
    });
    const browser = new Window();
    try {
      const container = browser.document.createElement("div");
      container.innerHTML = renderToString(module.default).html;
      expect(container.querySelector("output")?.textContent).toBe("2");
    } finally {
      browser.close();
    }
  });

  test("Hydrate accepts pointer continuation and cancellation events", async () => {
    const source = [
      'import { Hydrate } from "octane";',
      'import { interaction } from "octane/hydration";',
      'Hydrate(when={interaction({ events: ["pointerdown", "pointermove", "pointerup", "pointercancel"] })})',
      '  button(type="button") Drag',
    ].join("\n");
    expect(compile(compileBeastResult(source).code, "Pointer08.tsrx", { mode: "client", hmr: false }).diagnostics).toEqual([]);
    const module = await serverModule(source);
    const html = renderToString(module.default).html;
    expect(html).toContain("pointermove");
    expect(html).toContain("pointercancel");
  });

  test("development shell witnesses report event handlers in generated BTSX", async () => {
    const module = await serverModule('button(onClick={() => {}}) Shell action', true);
    const witnesses: Array<{ kind: string; name: string }> = [];
    expect(renderToString(module.default, {}, { shellWitness: witness => witnesses.push(witness) }).html).toContain("Shell action");
    expect(witnesses).toContainEqual(expect.objectContaining({ kind: "event", name: "onClick" }));
  });
});
