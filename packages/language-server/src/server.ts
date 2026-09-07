#!/usr/bin/env node

import * as ts from "typescript";
import { fileURLToPath } from "node:url";
import {
  createConnection,
  DiagnosticSeverity,
  DidChangeWatchedFilesNotification,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  type Diagnostic,
  type InitializeParams,
  type InitializeResult,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { BeastLanguageService } from "./language-service.js";
import { BeastTypeScriptHost } from "./typescript-host.js";
import { createTypeScriptDiagnosticsProvider, type TypeScriptDiagnosticsProvider } from "./typescript-diagnostics.js";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const service = new BeastLanguageService();
const workspaceRoots = new Set<string>();
let supportsDynamicFileWatching = false;

// TypeScript integration
let tsHost: BeastTypeScriptHost | null = null;
let tsLanguageService: ts.LanguageService | null = null;
let tsDiagnosticsProvider: TypeScriptDiagnosticsProvider | null = null;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  console.error("[beast-lsp] Server initializing...");
  const roots = params.workspaceFolders?.map((folder) => folder.uri)
    ?? (params.rootUri === null ? [] : [params.rootUri]);
  console.error(`[beast-lsp] Workspace roots: ${roots.join(", ")}`);
  workspaceRoots.clear();
  for (const root of roots) workspaceRoots.add(root);
  service.setWorkspaceRoots(roots);
  supportsDynamicFileWatching =
    params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration === true;

  // Initialize TypeScript service
  const rootPath = roots[0]
    ? (roots[0].startsWith("file:") ? fileURLToPath(roots[0]) : roots[0])
    : process.cwd();
  tsHost = new BeastTypeScriptHost(rootPath);
  tsLanguageService = ts.createLanguageService(tsHost);
  tsDiagnosticsProvider = createTypeScriptDiagnosticsProvider(tsHost, tsLanguageService);

  return {
    capabilities: {
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [".", "/", "\"", "'", "("],
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
  console.error("[beast-lsp] Server initialized, refreshing index...");
  void service.refresh();
  if (supportsDynamicFileWatching) {
    void connection.client.register(DidChangeWatchedFilesNotification.type, {
      watchers: [
        { globPattern: "**/*.btsx" },
        { globPattern: "**/*.ts" },
        { globPattern: "**/*.tsx" },
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
  tsHost?.updateDocument(event.document.uri, event.document.getText());
  publishDiagnostics(event.document);
});
documents.onDidChangeContent((event) => {
  tsHost?.updateDocument(event.document.uri, event.document.getText());
  publishDiagnostics(event.document);
});
documents.onDidSave(() => void service.refresh());
documents.onDidClose((event) => {
  tsHost?.removeDocument(event.document.uri);
  void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onDidChangeWatchedFiles(() => void service.refresh());

connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri);
  return document === undefined ? [] : service.completions(document, params.position);
});

connection.onDefinition(async (params) => {
  const document = documents.get(params.textDocument.uri);
  return document === undefined ? [] : service.definitions(document, params.position);
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
  return document === undefined ? null : service.hover(document, params.position);
});

connection.onReferences(async (params) => {
  const document = documents.get(params.textDocument.uri);
  return document === undefined
    ? []
    : service.references(document, params.position, params.context.includeDeclaration);
});

async function publishDiagnostics(document: TextDocument): Promise<void> {
  // Get Beast parse/compile diagnostics
  const beastDiagnostics = service.diagnostics(document);

  // Get TypeScript diagnostics (only if no Beast parse errors)
  let tsDiagnostics: Diagnostic[] = [];
  const hasBeastParseErrors = beastDiagnostics.some(
    (d) => d.severity === DiagnosticSeverity.Error,
  );
  if (!hasBeastParseErrors && tsDiagnosticsProvider) {
    tsDiagnostics = tsDiagnosticsProvider.getDiagnostics(document);
  }

  // Merge and deduplicate diagnostics
  const allDiagnostics = [...beastDiagnostics, ...tsDiagnostics];

  await connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: allDiagnostics,
  });
}

documents.listen(connection);
connection.listen();
