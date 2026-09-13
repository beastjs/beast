import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Position, type CompletionItem } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as localCompiler from "../../../src/index.js";

mock.module("beast-tsrx", () => localCompiler);
const { BeastTypeScriptFeatures } = await import("../src/typescript-features.js");

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

// Projects live inside the package so `octane` types resolve from node_modules.
async function createProject(): Promise<string> {
  const root = await mkdtemp(join(import.meta.dir, ".tmp-ts-project-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "components"));
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        jsxImportSource: "octane",
        strict: true,
        skipLibCheck: true,
      },
      include: ["**/*.ts"],
    }),
  );
  await writeFile(
    join(root, "utils.ts"),
    "/** Formats a price. */\nexport function formatPrice(value: number): string {\n  return `$${value}`;\n}\n",
  );
  await writeFile(
    join(root, "components", "Card.btsx"),
    "props { title }: { title: string }\narticle.card #{title}\n",
  );
  return root;
}

function open(root: string, name: string, source: string): TextDocument {
  return TextDocument.create(pathToFileURL(join(root, name)).href, "beast", 1, source);
}

function positionOf(document: TextDocument, needle: string, after = true): Position {
  const index = document.getText().indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  return document.positionAt(index + (after ? needle.length : 0));
}

describe("BeastTypeScriptFeatures", () => {
  test("reports unresolved references at their Beast location", async () => {
    const root = await createProject();
    const features = new BeastTypeScriptFeatures(root);
    const document = open(
      root,
      "App.btsx",
      'import { formatPrice } from "./utils.ts";\nprops { price }: { price: number }\nsetup const label = formatPrice(price) + missingName;\np #{label}\n',
    );

    const diagnostics = features.diagnostics(document);
    const missing = diagnostics.find((diagnostic) => diagnostic.code === 2304);
    expect(missing?.message).toContain("missingName");
    expect(missing?.range).toEqual({
      start: positionOf(document, "missingName", false),
      end: positionOf(document, "missingName"),
    });
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 1)).toHaveLength(1);
  });

  test("reports references inside template expressions", async () => {
    const root = await createProject();
    const features = new BeastTypeScriptFeatures(root);
    const document = open(root, "App.btsx", "props { name }: { name: string }\np #{nmae}\n");

    const missing = features.diagnostics(document).find((diagnostic) => diagnostic.message.includes("nmae"));
    expect(missing?.code === 2304 || missing?.code === 2552).toBe(true);
    expect(missing?.range.start).toEqual(positionOf(document, "nmae", false));
  });

  test("reports an unknown element once, on its Beast tag name", async () => {
    const root = await createProject();
    const features = new BeastTypeScriptFeatures(root);
    const document = open(root, "App.btsx", "props { label }: { label: string }\nbutton\n  fragment #{label}\n");

    const unknown = features.diagnostics(document).filter((diagnostic) => diagnostic.code === 2339);
    expect(unknown).toHaveLength(1);
    expect(unknown[0]?.range).toEqual({
      start: positionOf(document, "fragment", false),
      end: positionOf(document, "fragment"),
    });
  });

  test("type-checks props passed to imported Beast components", async () => {
    const root = await createProject();
    const features = new BeastTypeScriptFeatures(root);
    const document = open(
      root,
      "App.btsx",
      'import Card from "./components/Card.btsx";\nCard(title={42})\n',
    );

    const diagnostics = features.diagnostics(document);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(2322);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(2307);
  });

  test("completes members of values imported from TypeScript", async () => {
    const root = await createProject();
    const features = new BeastTypeScriptFeatures(root);
    const document = open(
      root,
      "App.btsx",
      'import { formatPrice } from "./utils.ts";\nsetup const label = formatPrice(1).\np #{label}\n',
    );

    const result = features.completions(document, positionOf(document, "formatPrice(1)."), ".");
    expect(result?.items.map((item) => item.label)).toContain("toUpperCase");
  });

  test("suggests exports from TypeScript files with an import edit", async () => {
    const root = await createProject();
    const features = new BeastTypeScriptFeatures(root);
    const source = "props { price }: { price: number }\nsetup const label = formatPr\np #{label}\n";
    const document = open(root, "App.btsx", source);

    const result = features.completions(document, positionOf(document, "formatPr"));
    const item = result?.items.find((candidate: CompletionItem) => candidate.label === "formatPrice");
    expect(item).toBeDefined();

    const resolved = features.resolveCompletion(item!, document, Position.create(0, 0));
    expect(resolved.detail).toContain("formatPrice(value: number): string");
    expect(resolved.additionalTextEdits).toEqual([
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        newText: 'import { formatPrice } from "./utils";\n',
      },
    ]);
  });

  test("hides identifiers that only exist in generated code", async () => {
    const root = await createProject();
    const features = new BeastTypeScriptFeatures(root);
    const document = open(
      root,
      "App.btsx",
      "props { items }: { items: string[] }\nul\n  each item in items key item\n    li #{it}\n",
    );

    const labels = features.completions(document, positionOf(document, "#{it"))?.items.map((item) => item.label) ?? [];
    expect(labels).toContain("item");
    expect(labels.some((label) => label.startsWith("__"))).toBe(false);
  });

  test("navigates to definitions in TypeScript files", async () => {
    const root = await createProject();
    const features = new BeastTypeScriptFeatures(root);
    const document = open(
      root,
      "App.btsx",
      'import { formatPrice } from "./utils.ts";\nsetup const label = formatPrice(1);\np #{label}\n',
    );

    const [definition] = features.definitions(document, positionOf(document, "= formatP"));
    expect(definition?.uri).toBe(pathToFileURL(join(root, "utils.ts")).href);
    expect(definition?.range.start).toEqual({ line: 1, character: 16 });
  });
});
