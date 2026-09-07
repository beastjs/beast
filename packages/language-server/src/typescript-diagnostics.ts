import * as ts from "typescript";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DiagnosticSeverity,
  type Diagnostic,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { BeastLanguageServiceHost } from "./typescript-host.js";
import { createSourceMapLookup } from "./source-map-lookup.js";

// TypeScript error codes to suppress - these are artifacts of compilation or handled elsewhere
const SUPPRESSED_CODES = new Set<number>([
  // Module resolution errors for .btsx imports (Beast handles these)
  2307, // Cannot find module

  // JSX-specific issues that TSRX handles differently
  2786, // 'X' cannot be used as a JSX component

  // Errors in generated code structure
  1005, // Expected token (often from incomplete compilation)
  1128, // Declaration or statement expected
]);

// Codes to show as warnings instead of errors
const DOWNGRADE_TO_WARNING = new Set<number>([
  6133, // 'x' is declared but its value is never read (unused variable)
  6196, // 'x' is declared but never used (unused import)
  6198, // All imports in import declaration are unused
]);

export interface TypeScriptDiagnosticsProvider {
  getDiagnostics(document: TextDocument): Diagnostic[];
}

export function createTypeScriptDiagnosticsProvider(
  host: BeastLanguageServiceHost,
  languageService: ts.LanguageService,
): TypeScriptDiagnosticsProvider {
  return {
    getDiagnostics(document: TextDocument): Diagnostic[] {
      const compiled = host.getCompiledDocument(document.uri);
      if (!compiled || compiled.tsrxCode.length === 0) {
        // No valid compilation, skip TypeScript diagnostics
        return [];
      }

      const filePath = document.uri.startsWith("file:")
        ? fileURLToPath(document.uri)
        : document.uri;
      const virtualPath = filePath.replace(/\.btsx$/u, ".ts");

      // Get semantic diagnostics (type errors, reference errors)
      let semanticDiagnostics: readonly ts.Diagnostic[] = [];
      let syntacticDiagnostics: readonly ts.DiagnosticWithLocation[] = [];

      try {
        semanticDiagnostics = languageService.getSemanticDiagnostics(virtualPath);
        syntacticDiagnostics = languageService.getSyntacticDiagnostics(virtualPath);
      } catch {
        // TypeScript service may throw if file is not in project
        return [];
      }

      const lookup = createSourceMapLookup(compiled.sourceMap);
      const results: Diagnostic[] = [];

      for (const tsDiag of [...semanticDiagnostics, ...syntacticDiagnostics]) {
        const mapped = mapTypeScriptDiagnostic(tsDiag, compiled.tsrxCode, lookup);
        if (mapped) {
          results.push(mapped);
        }
      }

      return results;
    },
  };
}

function mapTypeScriptDiagnostic(
  tsDiag: ts.Diagnostic,
  tsrxCode: string,
  lookup: ReturnType<typeof createSourceMapLookup>,
): Diagnostic | null {
  const code = tsDiag.code;

  // Filter suppressed diagnostics
  if (SUPPRESSED_CODES.has(code)) {
    return null;
  }

  // Need file and position information
  if (!tsDiag.file || tsDiag.start === undefined) {
    return null;
  }

  // Convert TypeScript position to line/character
  const tsStart = tsDiag.file.getLineAndCharacterOfPosition(tsDiag.start);
  const tsEnd = tsDiag.length
    ? tsDiag.file.getLineAndCharacterOfPosition(tsDiag.start + tsDiag.length)
    : tsStart;

  // Map back to Beast source position
  const beastRange = lookup.originalRange(
    tsStart.line,
    tsStart.character,
    tsEnd.line,
    tsEnd.character,
  );

  if (!beastRange) {
    // Cannot map position - this diagnostic is in generated code
    return null;
  }

  // Determine severity
  let severity: DiagnosticSeverity;
  if (DOWNGRADE_TO_WARNING.has(code)) {
    severity = DiagnosticSeverity.Warning;
  } else {
    switch (tsDiag.category) {
      case ts.DiagnosticCategory.Error:
        severity = DiagnosticSeverity.Error;
        break;
      case ts.DiagnosticCategory.Warning:
        severity = DiagnosticSeverity.Warning;
        break;
      case ts.DiagnosticCategory.Suggestion:
        severity = DiagnosticSeverity.Hint;
        break;
      default:
        severity = DiagnosticSeverity.Information;
    }
  }

  return {
    range: beastRange,
    severity,
    code: `TS${code}`,
    source: "typescript",
    message: ts.flattenDiagnosticMessageText(tsDiag.messageText, "\n"),
  };
}
