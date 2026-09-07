import { TraceMap, originalPositionFor, type SourceMapInput } from "@jridgewell/trace-mapping";
import type { Position, Range } from "vscode-languageserver/node";
import type { BeastSourceMap } from "beast-tsrx";

export interface SourceMapLookup {
  /** Map a TSRX position back to the original Beast position */
  originalPosition(tsrxLine: number, tsrxColumn: number): Position | null;

  /** Map a TSRX range back to a Beast range */
  originalRange(tsrxStartLine: number, tsrxStartCol: number, tsrxEndLine: number, tsrxEndCol: number): Range | null;
}

export function createSourceMapLookup(sourceMap: BeastSourceMap): SourceMapLookup {
  // Cast to SourceMapInput - BeastSourceMap is compatible with EncodedSourceMap
  const tracer = new TraceMap(sourceMap as unknown as SourceMapInput);

  return {
    originalPosition(tsrxLine: number, tsrxColumn: number): Position | null {
      // TraceMap uses 1-based lines, LSP uses 0-based
      const result = originalPositionFor(tracer, {
        line: tsrxLine + 1,
        column: tsrxColumn,
      });

      if (result.line === null || result.column === null) {
        return null;
      }

      return {
        line: result.line - 1, // Convert back to 0-based for LSP
        character: result.column,
      };
    },

    originalRange(
      tsrxStartLine: number,
      tsrxStartCol: number,
      tsrxEndLine: number,
      tsrxEndCol: number,
    ): Range | null {
      const startPos = this.originalPosition(tsrxStartLine, tsrxStartCol);
      const endPos = this.originalPosition(tsrxEndLine, tsrxEndCol);

      if (!startPos) {
        return null;
      }

      if (!endPos) {
        // Fallback: use start position and estimate end based on length difference
        const lineLength = tsrxEndCol - tsrxStartCol;
        return {
          start: startPos,
          end: {
            line: startPos.line,
            character: startPos.character + Math.max(1, lineLength),
          },
        };
      }

      return { start: startPos, end: endPos };
    },
  };
}
