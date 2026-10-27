import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "octane/compiler";
import { renderToStaticMarkup, renderToString } from "octane/server";
import { compileBeastResult } from "../src/index.js";

const MODES = ["client", "server"] as const;

async function loadServer(source: string) {
  let code = compile(compileBeastResult(source).code, "Upgrade16.tsrx", {
    mode: "server", hmr: false, dev: false,
  }).code;
  for (const specifier of ["octane/internal/server", "octane/server", "octane"]) {
    const resolved = JSON.stringify(import.meta.resolve(specifier));
    code = code.replaceAll(JSON.stringify(specifier), resolved).replaceAll(`'${specifier}'`, resolved);
  }
  const directory = await mkdtemp(resolve(tmpdir(), "beast-octane-16-"));
  try {
    const file = resolve(directory, "Upgrade16.mjs");
    await writeFile(file, code);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Octane 0.16 BTSX compatibility", () => {
  test.each(MODES)("module directives stay ahead of generated imports (%s)", mode => {
    const source = ['module "use strong";', "props { label }: { label: string }", "p #{label}"].join("\n");
    const result = compile(compileBeastResult(source).code, "Directive16.tsrx", { mode, hmr: false, dev: false });
    expect(result.diagnostics).toEqual([]);
    expect(result.code.trimStart().startsWith('"use strong";')).toBe(true);
  });

  test("hydratable roots open with protocol version 3 and static markup stays unmarked", async () => {
    const module = await loadServer(["props { name }: { name: string }", "section", "  p Hello #{name}"].join("\n"));
    const hydratable = renderToString(module.default, { name: "Ada" }).html;
    const staticMarkup = renderToStaticMarkup(module.default, { name: "Ada" }).html;
    expect(hydratable.startsWith("<!--3-->")).toBe(true);
    expect(hydratable).toMatch(/<p>Hello (?:<!--\[-->)?Ada(?:<!--\]-->)?<\/p>/u);
    expect(staticMarkup).toBe("<section><p>Hello Ada</p></section>");
  });

  test("a server error inside Suspense ships a client-render range without error details", async () => {
    const module = await loadServer([
      'import { ErrorBoundary, Suspense, use } from "octane";',
      "component Profile",
      "  props { data }: { data: PromiseLike<string> }",
      "  setup const value = use(data);",
      "  p #{value}",
      "props { data }: { data: PromiseLike<string> }",
      'ErrorBoundary(fallback="Failed.")',
      '  Suspense(fallback="Loading…")',
      "    Profile(data={data})",
    ].join("\n"));
    const data = { status: "rejected", reason: new Error("Secret backend detail"), then() {} };
    const html = renderToString(module.default, { data }).html;
    expect(html).toMatch(/<!--\[\$!/u);
    expect(html).not.toContain("Secret backend detail");
  });
});
