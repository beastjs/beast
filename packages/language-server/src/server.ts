#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  createConnection,
  DiagnosticSeverity,
  DidChangeWatchedFilesNotification,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  type CompletionItem,
  type InitializeParams,
  type InitializeResult,
  type Location,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { BeastLanguageService } from "./language-service.js";
import { BeastTypeScriptFeatures, isTypeScriptCompletionData } from "./typescript-features.js";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const service = new BeastLanguageService();
const workspaceRoots = new Set<string>();
let supportsDynamicFileWatching = false;
let typescript: BeastTypeScriptFeatures | null = null;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const roots = params.workspaceFolders?.map((folder) => folder.uri)
    ?? (params.rootUri === null ? [] : [params.rootUri]);
  workspaceRoots.clear();
  for (const root of roots) workspaceRoots.add(root);
  service.setWorkspaceRoots(roots);
  supportsDynamicFileWatching =
    params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration === true;

  const rootPath = roots[0]?.startsWith("file:") ? fileURLToPath(roots[0]) : process.cwd();
  try {
    typescript = new BeastTypeScriptFeatures(rootPath);
  } catch (error) {
    console.error(`[beast-lsp] TypeScript support unavailable: ${String(error)}`);
  }

  return {
    capabilities: {
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: [".", "/", "\"", "'", "(", "{"],
      },
      definitionProvider: true,
      documentLinkProvider: { resolveProvider: false },
      documentSymbolProvider: true,
      hoverProvider: true,
      referencesProvider: true,
      textDocumentSync: TextDocumentSyncKind.Incremental,
      workspace: {
        workspaceFolders: {
          changeNotifications: true,
          supported: true,
        },
      },
    },
  };
});

connection.onInitialized(() => {
  void service.refresh();
  if (supportsDynamicFileWatching) {
    void connection.client.register(DidChangeWatchedFilesNotification.type, {
      watchers: [
        { globPattern: "**/*.btsx" },
        { globPattern: "**/*.{ts,tsx,mts,cts,d.ts}" },
        { globPattern: "**/{tsconfig,jsconfig}*.json" },
        { globPattern: "**/package.json" },
      ],
    });
  }
  connection.workspace.onDidChangeWorkspaceFolders((event) => {
    for (const folder of event.removed) workspaceRoots.delete(folder.uri);
    for (const folder of event.added) workspaceRoots.add(folder.uri);
    service.setWorkspaceRoots([...workspaceRoots]);
    void service.refresh();
  });
});

documents.onDidOpen((event) => {
  typescript?.syncDocument(event.document);
  scheduleDiagnostics();
});
documents.onDidChangeContent((event) => {
  typescript?.syncDocument(event.document);
  // Other open components may import this one, so re-check all of them.
  scheduleDiagnostics();
});
documents.onDidSave(() => void service.refresh());
documents.onDidClose((event) => {
  typescript?.closeDocument(event.document.uri);
  void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onDidChangeWatchedFiles((params) => {
  typescript?.host.filesChanged(
    params.changes.flatMap((change) =>
      change.uri.startsWith("file:") ? [fileURLToPath(change.uri)] : []
    ),
  );
  void service.refresh();
  scheduleDiagnostics();
});

connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) return [];
  const beastItems = await service.completions(document, params.position);
  if (service.isImportPathPosition(document, params.position)) return beastItems;

  const tsResult = typescript?.completions(
    document,
    params.position,
    params.context?.triggerCharacter,
  );
  if (tsResult == null) return beastItems;
  if (beastItems.length === 0 || isInsideExpression(document, params.position)) {
    return { isIncomplete: tsResult.isIncomplete, items: tsResult.items };
  }

  // Element positions: Beast components/tags first, then TypeScript names.
  const labels = new Set(beastItems.map((item) => item.label));
  const items: CompletionItem[] = [...beastItems];
  for (const item of tsResult.items) {
    if (labels.has(item.label)) continue;
    items.push({ ...item, sortText: `5-${item.sortText ?? item.label}` });
  }
  return { isIncomplete: tsResult.isIncomplete, items };
});

connection.onCompletionResolve((item) => {
  if (!isTypeScriptCompletionData(item.data) || typescript === null) return item;
  const document = documents.get(item.data.uri);
  if (document === undefined) return item;
  return typescript.resolveCompletion(item, document, service.importInsertionPosition(document));
});

connection.onDefinition(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) return [];
  const beast = await service.definitions(document, params.position);
  if (beast.length > 0) return beast;
  return safely(() => typescript?.definitions(document, params.position) ?? [], [] as Location[]);
});

connection.onDocumentLinks(async (params) => {
  const document = documents.get(params.textDocument.uri);
  return document === undefined ? [] : service.documentLinks(document);
});

connection.onDocumentSymbol((params) => {
  const document = documents.get(params.textDocument.uri);
  return document === undefined ? [] : service.documentSymbols(document);
});

connection.onHover(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) return null;
  const tsHover = safely(() => typescript?.hover(document, params.position) ?? null, null);
  return tsHover ?? service.hover(document, params.position);
});

connection.onReferences(async (params) => {
  const document = documents.get(params.textDocument.uri);
  return document === undefined
    ? []
    : service.references(document, params.position, params.context.includeDeclaration);
});

let diagnosticsTimer: NodeJS.Timeout | undefined;

function scheduleDiagnostics(): void {
  clearTimeout(diagnosticsTimer);
  diagnosticsTimer = setTimeout(() => {
    for (const document of documents.all()) void publishDiagnostics(document);
  }, 150);
}

async function publishDiagnostics(document: TextDocument): Promise<void> {
  const beastDiagnostics = service.diagnostics(document);
  // TypeScript only sees compiled output, so it has nothing to say until Beast parses.
  const tsDiagnostics = beastDiagnostics.some((d) => d.severity === DiagnosticSeverity.Error)
    ? []
    : typescript?.diagnostics(document) ?? [];
  await connection.sendDiagnostics({
    uri: document.uri,
    version: document.version,
    diagnostics: [...beastDiagnostics, ...tsDiagnostics],
  });
}

/** Whether the cursor sits inside an unclosed `{` on its line (an embedded expression). */
function isInsideExpression(document: TextDocument, position: { line: number; character: number }): boolean {
  const prefix = document.getText({ start: { line: position.line, character: 0 }, end: position });
  let depth = 0;
  for (const character of prefix) {
    if (character === "{") depth += 1;
    else if (character === "}") depth = Math.max(0, depth - 1);
  }
  return depth > 0 || /^\s*(?:setup|module)\b/u.test(prefix);
}

function safely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch (error) {
    console.error(`[beast-lsp] TypeScript request failed: ${String(error)}`);
    return fallback;
  }
}

documents.listen(connection);
connection.listen();
