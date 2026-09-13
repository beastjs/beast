import * as ts from "typescript";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CompletionItemKind,
  DiagnosticSeverity,
  DiagnosticTag,
  MarkupKind,
  Position,
  Range,
  TextEdit,
  type CompletionItem,
  type Diagnostic,
  type Hover,
  type Location,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import {
  BeastTypeScriptHost,
  isVirtualPath,
  toBtsxPath,
  toVirtualPath,
} from "./typescript-host.js";
import type { BeastVirtualCode } from "./virtual-code.js";

// Diagnostics that describe how Beast/TSRX is lowered rather than authored code.
const SUPPRESSED_CODES = new Set<number>([
  2786, // 'X' cannot be used as a JSX component
  7026, // JSX element implicitly has type 'any' (no JSX namespace in the project)
]);

// Lowercase tags Beast emits as real elements that Octane's JSX types don't declare.
const BEAST_INTRINSIC_ELEMENTS = new Set(["fragment"]);
const PROPERTY_MISSING = 2339;

// Inserted at the cursor when half-typed code (`value.`) does not compile yet.
const COMPLETION_PLACEHOLDER = "__beast_completion";

const PREFERENCES: ts.UserPreferences = {
  includeCompletionsForModuleExports: true,
  includeCompletionsForImportStatements: true,
  includeCompletionsWithInsertText: true,
  includeAutomaticOptionalChainCompletions: true,
  importModuleSpecifierEnding: "auto",
  allowIncompleteCompletions: true,
};

export interface TypeScriptCompletionData {
  kind: "typescript";
  uri: string;
  /** Cursor offset in the Beast document. */
  sourceOffset: number;
  /** Whether the placeholder was needed to compile the document. */
  patched: boolean;
  offset: number;
  name: string;
  source?: string;
  entryData?: ts.CompletionEntryData;
}

export class BeastTypeScriptFeatures {
  readonly host: BeastTypeScriptHost;
  private readonly service: ts.LanguageService;

  constructor(workspaceRoot: string) {
    this.host = new BeastTypeScriptHost(workspaceRoot);
    this.service = ts.createLanguageService(this.host, ts.createDocumentRegistry());
  }

  syncDocument(document: TextDocument): void {
    const path = filePath(document.uri);
    if (path !== null) this.host.setOpenDocument(path, document.getText());
  }

  closeDocument(uri: string): void {
    const path = filePath(uri);
    if (path !== null) this.host.closeDocument(path);
  }

  diagnostics(document: TextDocument): Diagnostic[] {
    const context = this.context(document);
    if (context === null) return [];
    const { code, virtualPath } = context;

    let found: ts.Diagnostic[];
    try {
      found = [
        ...this.service.getSyntacticDiagnostics(virtualPath),
        ...this.service.getSemanticDiagnostics(virtualPath),
        ...this.service.getSuggestionDiagnostics(virtualPath),
      ];
    } catch (error) {
      console.error(`[beast-lsp] TypeScript diagnostics failed: ${String(error)}`);
      return [];
    }

    const results: Diagnostic[] = [];
    // Opening and closing JSX tags both map back to the one Beast element name.
    const seen = new Set<string>();
    for (const diagnostic of found) {
      if (SUPPRESSED_CODES.has(diagnostic.code) || diagnostic.start === undefined) continue;
      if (diagnostic.code === PROPERTY_MISSING && isBeastIntrinsicTag(code.code, diagnostic.start)) continue;
      const range = code.toSourceRange(
        diagnostic.start,
        diagnostic.start + (diagnostic.length ?? 0),
        "verification",
      );
      if (range === null) continue;
      const suggestion = diagnostic.category === ts.DiagnosticCategory.Suggestion;
      // Suggestions are only worth surfacing when the editor can render them as
      // faded/struck-through code; the rest are refactoring hints.
      if (suggestion && !diagnostic.reportsUnnecessary && !diagnostic.reportsDeprecated) continue;
      const tags: DiagnosticTag[] = [];
      if (diagnostic.reportsUnnecessary) tags.push(DiagnosticTag.Unnecessary);
      if (diagnostic.reportsDeprecated) tags.push(DiagnosticTag.Deprecated);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      const key = `${range.start}:${range.end}:${diagnostic.code}:${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        range: Range.create(document.positionAt(range.start), document.positionAt(range.end)),
        severity: severity(diagnostic.category),
        code: diagnostic.code,
        source: "ts",
        message,
        ...(tags.length === 0 ? {} : { tags }),
      });
    }
    return results;
  }

  /** TypeScript completions, or null when the position is not TypeScript code. */
  completions(
    document: TextDocument,
    position: Position,
    triggerCharacter?: string,
  ): { items: CompletionItem[]; isIncomplete: boolean } | null {
    const sourceOffset = document.offsetAt(position);
    let patched = false;
    let context = this.context(document);
    let offset = context?.code.toGeneratedOffset(sourceOffset, "completion") ?? null;
    if (offset === null) {
      patched = true;
      context = this.context(document, sourceOffset);
      offset = context?.code.toGeneratedOffset(sourceOffset, "completion") ?? null;
    }
    if (context === null || offset === null) return null;
    const { code, virtualPath } = context;

    let info: ts.WithMetadata<ts.CompletionInfo> | undefined;
    try {
      info = this.service.getCompletionsAtPosition(virtualPath, offset, {
        ...PREFERENCES,
        ...(isTriggerCharacter(triggerCharacter) ? { triggerCharacter } : {}),
      });
    } catch (error) {
      console.error(`[beast-lsp] TypeScript completions failed: ${String(error)}`);
      return null;
    }
    if (info === undefined) return null;

    const generatedOnly = this.generatedOnlyBindings(virtualPath, code);
    const defaultRange = wordRangeAt(document, position);
    const items: CompletionItem[] = [];
    for (const entry of info.entries) {
      if (entry.source === undefined && (generatedOnly.has(entry.name) || isGeneratedName(entry.name))) {
        continue;
      }
      let range = defaultRange;
      if (entry.replacementSpan !== undefined) {
        const mapped = code.toSourceRange(
          entry.replacementSpan.start,
          entry.replacementSpan.start + entry.replacementSpan.length,
          "completion",
        );
        if (mapped !== null) {
          const end = patched ? Math.min(mapped.end, sourceOffset) : mapped.end;
          range = Range.create(document.positionAt(mapped.start), document.positionAt(end));
        }
      }
      const data: TypeScriptCompletionData = {
        kind: "typescript",
        uri: document.uri,
        sourceOffset,
        patched,
        offset,
        name: entry.name,
        ...(entry.source === undefined ? {} : { source: entry.source }),
        ...(entry.data === undefined ? {} : { entryData: entry.data }),
      };
      items.push({
        label: entry.name,
        kind: completionKind(entry.kind),
        sortText: entry.sortText,
        ...(entry.source === undefined
          ? {}
          : { labelDetails: { description: entry.sourceDisplay ? ts.displayPartsToString(entry.sourceDisplay) : entry.source } }),
        ...(entry.filterText === undefined ? {} : { filterText: entry.filterText }),
        textEdit: TextEdit.replace(range, entry.insertText ?? entry.name),
        ...(entry.isSnippet ? { insertTextFormat: 2 } : {}),
        data,
      });
    }
    return { items, isIncomplete: info.isIncomplete === true };
  }

  /**
   * Fill in documentation and auto-import edits. `importPosition` is where a new
   * import goes in the Beast file when TypeScript's edit lands in generated code.
   */
  resolveCompletion(
    item: CompletionItem,
    document: TextDocument,
    importPosition: Position,
  ): CompletionItem {
    const data = item.data as TypeScriptCompletionData;
    const context = this.context(document, data.patched ? data.sourceOffset : undefined);
    if (context === null) return item;
    const { code, virtualPath } = context;

    let details: ts.CompletionEntryDetails | undefined;
    try {
      details = this.service.getCompletionEntryDetails(
        virtualPath,
        data.offset,
        data.name,
        {},
        data.source,
        PREFERENCES,
        data.entryData,
      );
    } catch {
      return item;
    }
    if (details === undefined) return item;

    const detail = ts.displayPartsToString(details.displayParts);
    const documentation = ts.displayPartsToString(details.documentation);
    const edits: TextEdit[] = [];
    for (const action of details.codeActions ?? []) {
      for (const change of action.changes) {
        if (change.fileName !== virtualPath) continue;
        for (const textChange of change.textChanges) {
          edits.push(mapTextChange(textChange, code, document, importPosition));
        }
      }
    }

    return {
      ...item,
      ...(detail.length === 0 ? {} : { detail }),
      ...(documentation.length === 0
        ? {}
        : { documentation: { kind: MarkupKind.Markdown, value: documentation } }),
      ...(edits.length === 0 ? {} : { additionalTextEdits: edits }),
    };
  }

  hover(document: TextDocument, position: Position): Hover | null {
    const context = this.context(document);
    if (context === null) return null;
    const { code, virtualPath } = context;
    const offset = code.toGeneratedOffset(document.offsetAt(position), "semantic");
    if (offset === null) return null;

    const info = this.service.getQuickInfoAtPosition(virtualPath, offset);
    if (info === undefined) return null;
    const signature = ts.displayPartsToString(info.displayParts);
    const documentation = ts.displayPartsToString(info.documentation);
    const range = code.toSourceRange(info.textSpan.start, info.textSpan.start + info.textSpan.length, "semantic");
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: ["```typescript", signature, "```", documentation].filter((part) => part.length > 0).join("\n"),
      },
      ...(range === null
        ? {}
        : { range: Range.create(document.positionAt(range.start), document.positionAt(range.end)) }),
    };
  }

  definitions(document: TextDocument, position: Position): Location[] {
    const context = this.context(document);
    if (context === null) return [];
    const { code, virtualPath } = context;
    const offset = code.toGeneratedOffset(document.offsetAt(position), "navigation");
    if (offset === null) return [];

    const definitions = this.service.getDefinitionAtPosition(virtualPath, offset) ?? [];
    const program = this.service.getProgram();
    const locations: Location[] = [];
    for (const definition of definitions) {
      const { start, length } = definition.textSpan;
      if (isVirtualPath(definition.fileName)) {
        const btsxPath = toBtsxPath(definition.fileName);
        const target = this.host.getVirtualCode(btsxPath);
        const range = target?.toSourceRange(start, start + length, "navigation");
        if (target == null || range == null) continue;
        locations.push({
          uri: pathToFileURL(btsxPath).href,
          range: offsetRange(target.source, range.start, range.end),
        });
        continue;
      }
      const sourceFile = program?.getSourceFile(definition.fileName);
      if (sourceFile === undefined) continue;
      const from = sourceFile.getLineAndCharacterOfPosition(start);
      const to = sourceFile.getLineAndCharacterOfPosition(start + length);
      locations.push({
        uri: pathToFileURL(definition.fileName).href,
        range: Range.create(from.line, from.character, to.line, to.character),
      });
    }
    return locations;
  }

  /**
   * Sync the document into TypeScript and return its virtual code. With
   * `placeholderAt`, the placeholder identifier is inserted at that offset; the
   * next plain sync restores the real text.
   */
  private context(
    document: TextDocument,
    placeholderAt?: number,
  ): { code: BeastVirtualCode; virtualPath: string } | null {
    const path = filePath(document.uri);
    if (path === null) return null;
    const text = document.getText();
    this.host.setOpenDocument(
      path,
      placeholderAt === undefined
        ? text
        : `${text.slice(0, placeholderAt)}${COMPLETION_PLACEHOLDER}${text.slice(placeholderAt)}`,
    );
    const code = this.host.getVirtualCode(path);
    return code === null ? null : { code, virtualPath: toVirtualPath(path) };
  }

  /** Names bound only by imports the Octane lowering inserted (Suspense, helpers, ...). */
  private generatedOnlyBindings(virtualPath: string, code: BeastVirtualCode): Set<string> {
    const names = new Set<string>();
    const sourceFile = this.service.getProgram()?.getSourceFile(virtualPath);
    for (const statement of sourceFile?.statements ?? []) {
      if (!ts.isImportDeclaration(statement)) continue;
      const start = statement.getStart(sourceFile);
      if (code.toSourceRange(start, statement.end, "completion") !== null) continue;
      const clause = statement.importClause;
      if (clause?.name !== undefined) names.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) names.add(element.name.text);
      }
    }
    return names;
  }
}

export function isTypeScriptCompletionData(data: unknown): data is TypeScriptCompletionData {
  return typeof data === "object" && data !== null && (data as { kind?: unknown }).kind === "typescript";
}

function mapTextChange(
  change: ts.TextChange,
  code: BeastVirtualCode,
  document: TextDocument,
  importPosition: Position,
): TextEdit {
  const { start, length } = change.span;
  // A brand-new import statement is positioned relative to generated prelude
  // imports, so place it by Beast's own rules instead.
  const newImport = length === 0 && /^\s*import\b/u.test(change.newText);
  const mapped = newImport ? null : code.toSourceRange(start, start + length, "completion");
  if (mapped !== null) {
    return TextEdit.replace(
      Range.create(document.positionAt(mapped.start), document.positionAt(mapped.end)),
      change.newText,
    );
  }
  return TextEdit.insert(importPosition, `${change.newText.trim()}\n`);
}

function filePath(uri: string): string | null {
  if (!uri.startsWith("file:")) return null;
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

function severity(category: ts.DiagnosticCategory): DiagnosticSeverity {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return DiagnosticSeverity.Error;
    case ts.DiagnosticCategory.Warning:
      return DiagnosticSeverity.Warning;
    case ts.DiagnosticCategory.Suggestion:
      return DiagnosticSeverity.Hint;
    default:
      return DiagnosticSeverity.Information;
  }
}

function isTriggerCharacter(value: string | undefined): value is ts.CompletionsTriggerCharacter {
  return value !== undefined && [".", "\"", "'", "`", "/", "@", "<", "#", " "].includes(value);
}

/** Whether `offset` starts an opening or closing tag for a Beast-only intrinsic element. */
function isBeastIntrinsicTag(tsx: string, offset: number): boolean {
  const tag = /^<\/?([a-z][\w-]*)/u.exec(tsx.slice(offset, offset + 64))?.[1];
  return tag !== undefined && BEAST_INTRINSIC_ELEMENTS.has(tag);
}

function isGeneratedName(name: string): boolean {
  return name.startsWith("__") || /__static\d*$/u.test(name);
}

function wordRangeAt(document: TextDocument, position: Position): Range {
  const line = document.getText(Range.create(position.line, 0, position.line, position.character));
  const word = line.match(/[A-Za-z0-9_$]*$/u)?.[0] ?? "";
  return Range.create(position.line, position.character - word.length, position.line, position.character);
}

function offsetRange(text: string, start: number, end: number): Range {
  const at = (offset: number): Position => {
    const before = text.slice(0, offset);
    const line = before.split("\n").length - 1;
    return Position.create(line, offset - (before.lastIndexOf("\n") + 1));
  };
  return Range.create(at(start), at(end));
}

function completionKind(kind: ts.ScriptElementKind): CompletionItemKind {
  switch (kind) {
    case ts.ScriptElementKind.primitiveType:
    case ts.ScriptElementKind.keyword:
      return CompletionItemKind.Keyword;
    case ts.ScriptElementKind.constElement:
    case ts.ScriptElementKind.letElement:
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
    case ts.ScriptElementKind.alias:
    case ts.ScriptElementKind.parameterElement:
      return CompletionItemKind.Variable;
    case ts.ScriptElementKind.memberVariableElement:
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
      return CompletionItemKind.Field;
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
      return CompletionItemKind.Function;
    case ts.ScriptElementKind.memberFunctionElement:
    case ts.ScriptElementKind.constructSignatureElement:
    case ts.ScriptElementKind.callSignatureElement:
    case ts.ScriptElementKind.indexSignatureElement:
      return CompletionItemKind.Method;
    case ts.ScriptElementKind.enumElement:
      return CompletionItemKind.Enum;
    case ts.ScriptElementKind.enumMemberElement:
      return CompletionItemKind.EnumMember;
    case ts.ScriptElementKind.moduleElement:
    case ts.ScriptElementKind.externalModuleName:
      return CompletionItemKind.Module;
    case ts.ScriptElementKind.classElement:
    case ts.ScriptElementKind.typeElement:
      return CompletionItemKind.Class;
    case ts.ScriptElementKind.interfaceElement:
      return CompletionItemKind.Interface;
    case ts.ScriptElementKind.typeParameterElement:
      return CompletionItemKind.TypeParameter;
    case ts.ScriptElementKind.scriptElement:
      return CompletionItemKind.File;
    case ts.ScriptElementKind.directory:
      return CompletionItemKind.Folder;
    case ts.ScriptElementKind.string:
      return CompletionItemKind.Constant;
    default:
      return CompletionItemKind.Property;
  }
}
