import { originalPositionFor, LEAST_UPPER_BOUND, TraceMap } from "@jridgewell/trace-mapping";
import type { SourceSpan } from "./ast.js";
import type { BeastSourceMap } from "./source-map.js";

export type DiagnosticSeverity = "error" | "warning";

export interface BeastDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  filename: string;
  span: SourceSpan;
  hint?: string;
}

export class BeastCompileError extends Error {
  readonly diagnostic: BeastDiagnostic;

  constructor(diagnostic: BeastDiagnostic) {
    const { filename, span } = diagnostic;
    super(
      `${filename}:${span.start.line}:${span.start.column} - ${diagnostic.code}: ${diagnostic.message}`,
    );
    this.name = "BeastCompileError";
    this.diagnostic = diagnostic;
  }
}

export function formatDiagnostic(
  diagnostic: BeastDiagnostic,
  source?: string,
): string {
  const location = `${diagnostic.filename}:${diagnostic.span.start.line}:${diagnostic.span.start.column}`;
  const header = `${location} - ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`;
  if (source === undefined) {
    return diagnostic.hint === undefined ? header : `${header}\nHint: ${diagnostic.hint}`;
  }

  const line = source.split(/\r?\n/u)[diagnostic.span.start.line - 1] ?? "";
  const caretWidth = Math.max(
    1,
    diagnostic.span.end.line === diagnostic.span.start.line
      ? diagnostic.span.end.column - diagnostic.span.start.column
      : 1,
  );
  const marker = `${" ".repeat(Math.max(0, diagnostic.span.start.column - 1))}${"^".repeat(caretWidth)}`;
  const body = `${line}\n${marker}`;
  return diagnostic.hint === undefined
    ? `${header}\n${body}`
    : `${header}\n${body}\nHint: ${diagnostic.hint}`;
}

/**
 * Re-anchor an error thrown by Octane while compiling generated TSRX onto the
 * authored `.btsx` source. Pass the generated TSRX so offset-only parser
 * errors can be located too. Errors without a usable location pass through
 * unchanged.
 */
export function mapGeneratedError(
  error: unknown,
  map: BeastSourceMap,
  source: string,
  filename: string,
  generated?: string,
): unknown {
  if (error instanceof BeastCompileError || !(error instanceof Error)) return error;
  type Location = { line?: unknown; column?: unknown };
  const octaneError = error as Error & {
    loc?: Location & { start?: Location };
    pos?: unknown;
    diagnostic?: { start?: Location; code?: string; message?: string };
  };
  // Parser errors use loc.start; semantic diagnostics (including removed
  // Context.Provider access) expose a flat loc and diagnostic.start. Some
  // template validation errors (Octane 0.7 textarea children) only carry a
  // 1-based `(file:line:col)` suffix, and some parser errors only an offset.
  const start =
    octaneError.diagnostic?.start ??
    octaneError.loc?.start ??
    octaneError.loc ??
    messageLocation(error.message) ??
    offsetLocation(octaneError.pos, generated);
  if (typeof start?.line !== "number" || typeof start.column !== "number") return error;

  const trace = new TraceMap(map as never);
  const found = originalPositionFor(trace, { line: start.line, column: start.column });
  const original =
    found.line === null
      ? originalPositionFor(trace, {
          line: start.line,
          column: start.column,
          bias: LEAST_UPPER_BOUND,
        })
      : found;
  if (original.line === null || original.column === null) return error;

  const lines = source.split(/\r?\n/u);
  let offset = 0;
  for (let index = 0; index < original.line - 1; index += 1) {
    offset += (lines[index]?.length ?? 0) + (source.startsWith("\r\n", offset + (lines[index]?.length ?? 0)) ? 2 : 1);
  }
  offset += original.column;
  const position = { offset, line: original.line, column: original.column + 1 };
  const message = octaneError.diagnostic?.message === undefined
    ? error.message.replace(/\s*\((?:[^()\n]*:)?\d+:\d+\)\s*$/u, "")
    : `${octaneError.diagnostic.code ?? "OCTANE"}: ${octaneError.diagnostic.message}`;
  return new BeastCompileError({
    code: "BEAST9001_OCTANE",
    severity: "error",
    message,
    filename,
    span: {
      start: position,
      end: { ...position, offset: offset + 1, column: position.column + 1 },
    },
  });
}

function messageLocation(message: string): { line: number; column: number } | undefined {
  const match = /\((?:[^()\n]*:)?(\d+):(\d+)\)\s*$/u.exec(message);
  if (match === null) return undefined;
  return { line: Number(match[1]), column: Math.max(0, Number(match[2]) - 1) };
}

function offsetLocation(
  pos: unknown,
  generated: string | undefined,
): { line: number; column: number } | undefined {
  if (typeof pos !== "number" || generated === undefined || pos < 0 || pos > generated.length) {
    return undefined;
  }
  const before = generated.slice(0, pos);
  const lineStart = before.lastIndexOf("\n") + 1;
  return { line: before.split("\n").length, column: pos - lineStart };
}
