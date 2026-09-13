import { TraceMap, decodedMappings, type SourceMapInput } from "@jridgewell/trace-mapping";
import { compileBeastResult, type BeastSourceMap } from "beast-tsrx";
import { compileToVolarMappings } from "octane/compiler/volar";

/** Language features a generated TSX range may participate in. */
export type VirtualCodeFeature = "completion" | "navigation" | "semantic" | "verification";

export interface SourceOffsetRange {
  start: number;
  end: number;
}

/**
 * A `.btsx` document lowered to TypeScript-checkable TSX.
 *
 * Beast compiles to TSRX (with a line-level source map), and Octane lowers TSRX
 * to TSX (with exact offset mappings). The two maps are composed here so TS
 * offsets can be translated to Beast offsets and back.
 */
export interface BeastVirtualCode {
  /** Authored Beast source. */
  readonly source: string;
  /** Intermediate TSRX emitted by the Beast compiler. */
  readonly tsrx: string;
  /** TSX handed to the TypeScript language service. */
  readonly code: string;
  toSourceRange(start: number, end: number, feature: VirtualCodeFeature): SourceOffsetRange | null;
  toGeneratedOffset(sourceOffset: number, feature: VirtualCodeFeature): number | null;
}

export function createBeastVirtualCode(source: string, filePath: string): BeastVirtualCode | null {
  let tsrx: string;
  let beastMap: BeastSourceMap;
  try {
    const result = compileBeastResult(source, { filename: filePath });
    tsrx = result.code;
    beastMap = result.map;
  } catch {
    return null;
  }

  let volar: ReturnType<typeof compileToVolarMappings>;
  try {
    volar = compileToVolarMappings(tsrx, filePath.replace(/\.btsx$/u, ".tsrx"), { loose: true });
  } catch {
    return null;
  }
  if (volar.code.length === 0) return null;

  const beast = new BeastLineMap(source, tsrx, beastMap);
  const tsx = new OffsetMap(volar.mappings);

  return {
    source,
    tsrx,
    code: volar.code,
    toSourceRange(start, end, feature) {
      let tsrxStart = tsx.toSource(start, feature, false);
      if (tsrxStart === null) return null;
      let tsrxEnd = Math.max(tsrxStart, tsx.toSource(end, feature, true) ?? tsrxStart + (end - start));
      // Drop JSX/statement punctuation Beast never writes (`<`/`</` and `>` around
      // a tag name, a trailing `;`) so opening and closing tags map to one range.
      const text = tsrx.slice(tsrxStart, tsrxEnd);
      const leading = /^<\/?/u.exec(text)?.[0].length ?? 0;
      const trailing = (leading > 0 ? /\/?>$/u : /;$/u).exec(text.slice(leading))?.[0].length ?? 0;
      if (leading + trailing < text.length) {
        tsrxStart += leading;
        tsrxEnd -= trailing;
      }
      const sourceStart = beast.toSource(tsrxStart, tsrx.slice(tsrxStart, tsrxEnd));
      if (sourceStart === null) return null;
      return {
        start: sourceStart,
        end: Math.min(source.length, sourceStart + (tsrxEnd - tsrxStart)),
      };
    },
    toGeneratedOffset(sourceOffset, feature) {
      const tsrxOffset = beast.toGenerated(sourceOffset);
      return tsrxOffset === null ? null : tsx.toGenerated(tsrxOffset, feature);
    },
  };
}

interface VolarMapping {
  sourceOffsets: number[];
  generatedOffsets: number[];
  lengths: number[];
  generatedLengths?: number[];
  data: Partial<Record<VirtualCodeFeature, unknown>>;
}

/** Offset mappings between TSRX (source) and TSX (generated), as emitted for Volar. */
class OffsetMap {
  private readonly mappings: readonly VolarMapping[];

  constructor(mappings: readonly unknown[]) {
    this.mappings = mappings as VolarMapping[];
  }

  toSource(offset: number, feature: VirtualCodeFeature, preferEnd: boolean): number | null {
    return this.translate(offset, feature, preferEnd, "generatedOffsets", "sourceOffsets");
  }

  toGenerated(offset: number, feature: VirtualCodeFeature): number | null {
    return this.translate(offset, feature, true, "sourceOffsets", "generatedOffsets");
  }

  private translate(
    offset: number,
    feature: VirtualCodeFeature,
    preferEnd: boolean,
    from: "generatedOffsets" | "sourceOffsets",
    to: "generatedOffsets" | "sourceOffsets",
  ): number | null {
    let boundary: number | null = null;
    for (const mapping of this.mappings) {
      if (!mapping.data[feature]) continue;
      for (let index = 0; index < mapping[from].length; index += 1) {
        const fromStart = mapping[from][index] ?? 0;
        const fromLength = lengthAt(mapping, from, index);
        if (offset < fromStart || offset > fromStart + fromLength) continue;
        const toStart = mapping[to][index] ?? 0;
        const translated = toStart + Math.min(offset - fromStart, lengthAt(mapping, to, index));
        // An offset on the edge of two adjacent mappings belongs to the one it
        // ends (for range ends and cursors) or starts (for range starts).
        const atEdge = offset === (preferEnd ? fromStart : fromStart + fromLength) && fromLength > 0;
        if (!atEdge) return translated;
        boundary ??= translated;
      }
    }
    return boundary;
  }
}

function lengthAt(
  mapping: VolarMapping,
  side: "generatedOffsets" | "sourceOffsets",
  index: number,
): number {
  const lengths = side === "generatedOffsets" ? mapping.generatedLengths ?? mapping.lengths : mapping.lengths;
  return lengths[index] ?? 0;
}

interface LineSegment {
  generatedLine: number;
  generatedColumn: number;
  sourceLine: number;
  sourceColumn: number;
}

/**
 * The Beast source map records one segment per emitted construct (a line, an
 * attribute, ...). Code inside a segment is usually copied verbatim, so offsets
 * are interpolated from the segment start and then verified against the text on
 * both sides, searching nearby when Beast rewrote the surrounding syntax.
 */
class BeastLineMap {
  private readonly source: string;
  private readonly generated: string;
  private readonly sourceLineStarts: number[];
  private readonly generatedLineStarts: number[];
  private readonly byGeneratedLine: LineSegment[][] = [];
  private readonly bySourceLine: LineSegment[][] = [];

  constructor(source: string, generated: string, map: BeastSourceMap) {
    this.source = source;
    this.generated = generated;
    this.sourceLineStarts = lineStarts(source);
    this.generatedLineStarts = lineStarts(generated);
    const decoded = decodedMappings(new TraceMap(map as unknown as SourceMapInput));
    decoded.forEach((segments, generatedLine) => {
      for (const segment of segments) {
        if (segment.length < 4) continue;
        const entry: LineSegment = {
          generatedLine,
          generatedColumn: segment[0],
          sourceLine: segment[2] ?? 0,
          sourceColumn: segment[3] ?? 0,
        };
        (this.byGeneratedLine[generatedLine] ??= []).push(entry);
        (this.bySourceLine[entry.sourceLine] ??= []).push(entry);
      }
    });
    for (const segments of this.bySourceLine) {
      segments?.sort((left, right) => right.sourceColumn - left.sourceColumn);
    }
  }

  /** Translate a TSRX offset whose range covers `text` into a Beast offset. */
  toSource(offset: number, text: string): number | null {
    const { line, column } = locate(this.generatedLineStarts, offset);
    const segment = lastSegmentAtOrBefore(this.byGeneratedLine[line], column);
    if (segment === undefined) return null;
    const segmentStart = (this.sourceLineStarts[segment.sourceLine] ?? 0) + segment.sourceColumn;
    const candidate = segmentStart + (column - segment.generatedColumn);
    if (text.length === 0 || this.source.startsWith(text, candidate)) return candidate;

    // Beast may have rewritten syntax before the expression on this line
    // (`p #{value}` -> `<p>{value}`); find the same text near the candidate.
    const windowStart = this.sourceLineStarts[segment.sourceLine] ?? 0;
    const windowEnd = this.sourceLineStarts[segment.sourceLine + 4] ?? this.source.length;
    return nearestOccurrence(this.source, text, candidate, windowStart, windowEnd) ?? segmentStart;
  }

  /** Translate a Beast offset (typically a cursor) into a TSRX offset. */
  toGenerated(offset: number): number | null {
    const { line, column } = locate(this.sourceLineStarts, offset);
    const segments = this.bySourceLine[line]?.filter((segment) => segment.sourceColumn <= column) ?? [];
    if (segments.length === 0) return null;
    const lineStart = this.sourceLineStarts[line] ?? 0;
    const prefix = this.source.slice(lineStart, offset).match(/[^\s{}()]*$/u)?.[0] ?? "";

    let fallback: number | null = null;
    for (const segment of segments) {
      const generatedLineStart = this.generatedLineStarts[segment.generatedLine] ?? 0;
      const candidate = generatedLineStart + segment.generatedColumn + (column - segment.sourceColumn);
      if (this.generated.endsWith(prefix, candidate)) return candidate;
      fallback ??= candidate;
      if (prefix.length === 0) continue;
      const lineEnd = this.generatedLineStarts[segment.generatedLine + 1] ?? this.generated.length;
      const found = nearestOccurrence(this.generated, prefix, candidate - prefix.length, generatedLineStart, lineEnd);
      if (found !== null) return found + prefix.length;
    }
    return fallback;
  }
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function locate(starts: readonly number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low, column: offset - (starts[low] ?? 0) };
}

function lastSegmentAtOrBefore(
  segments: readonly LineSegment[] | undefined,
  column: number,
): LineSegment | undefined {
  let match: LineSegment | undefined;
  for (const segment of segments ?? []) {
    if (segment.generatedColumn > column) break;
    match = segment;
  }
  return match;
}

function nearestOccurrence(
  haystack: string,
  needle: string,
  target: number,
  windowStart: number,
  windowEnd: number,
): number | null {
  let best: number | null = null;
  let index = haystack.indexOf(needle, windowStart);
  while (index !== -1 && index + needle.length <= windowEnd) {
    if (best === null || Math.abs(index - target) < Math.abs(best - target)) best = index;
    index = haystack.indexOf(needle, index + 1);
  }
  return best;
}
