import * as ts from "typescript";
import { dirname } from "node:path";
import { createBeastVirtualCode, type BeastVirtualCode } from "./virtual-code.js";

const VIRTUAL_EXTENSION = ".tsx";

/** `/app/Card.btsx` is analyzed by TypeScript as `/app/Card.btsx.tsx`. */
export function toVirtualPath(btsxPath: string): string {
  return `${btsxPath}${VIRTUAL_EXTENSION}`;
}

export function isVirtualPath(fileName: string): boolean {
  return fileName.endsWith(`.btsx${VIRTUAL_EXTENSION}`);
}

export function toBtsxPath(virtualPath: string): string {
  return virtualPath.slice(0, -VIRTUAL_EXTENSION.length);
}

interface OpenDocument {
  source: string;
  version: number;
}

interface CachedVirtualCode {
  source: string;
  code: BeastVirtualCode | null;
}

/**
 * Serves `.btsx` files to TypeScript as virtual TSX, alongside the workspace's
 * real TypeScript files. Relative and path-aliased `.btsx` imports resolve
 * through ordinary module resolution because `Card.btsx.tsx` "exists" whenever
 * `Card.btsx` does.
 */
export class BeastTypeScriptHost implements ts.LanguageServiceHost {
  private readonly workspaceRoot: string;
  private readonly openDocuments = new Map<string, OpenDocument>();
  private readonly virtualCodes = new Map<string, CachedVirtualCode>();
  private projectVersion = 0;
  private compilerOptions: ts.CompilerOptions = {};
  private projectFileNames: string[] = [];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.loadProject();
  }

  /** Re-read tsconfig.json and the project's root files. */
  loadProject(): void {
    const defaults: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "octane",
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
    };
    let options: ts.CompilerOptions = {};
    let fileNames: string[] = [];

    const configPath = ts.findConfigFile(this.workspaceRoot, ts.sys.fileExists, "tsconfig.json");
    if (configPath !== undefined) {
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      if (config.error === undefined) {
        const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
        options = parsed.options;
        fileNames = parsed.fileNames;
      }
    }

    this.compilerOptions = {
      ...defaults,
      ...options,
      // Analysis only: Beast components import `.ts`/`.btsx` specifiers directly.
      noEmit: true,
      allowImportingTsExtensions: true,
      allowArbitraryExtensions: true,
    };
    this.projectFileNames = fileNames;
    this.projectVersion += 1;
  }

  setOpenDocument(btsxPath: string, source: string): void {
    const existing = this.openDocuments.get(btsxPath);
    if (existing?.source === source) return;
    this.openDocuments.set(btsxPath, { source, version: (existing?.version ?? 0) + 1 });
    this.projectVersion += 1;
  }

  closeDocument(btsxPath: string): void {
    if (this.openDocuments.delete(btsxPath)) this.projectVersion += 1;
  }

  /** Note that files changed on disk; TypeScript re-reads them by modified time. */
  filesChanged(paths: readonly string[]): void {
    for (const path of paths) {
      if (/(?:^|[\\/])(?:tsconfig|jsconfig)[^\\/]*\.json$/u.test(path)) {
        this.loadProject();
        return;
      }
      this.virtualCodes.delete(path);
    }
    this.projectVersion += 1;
  }

  /** The virtual TSX for a Beast file, or null when it does not compile. */
  getVirtualCode(btsxPath: string): BeastVirtualCode | null {
    const source = this.openDocuments.get(btsxPath)?.source ?? ts.sys.readFile(btsxPath);
    if (source === undefined) return null;
    const cached = this.virtualCodes.get(btsxPath);
    if (cached?.source === source) return cached.code;
    const code = createBeastVirtualCode(source, btsxPath);
    this.virtualCodes.set(btsxPath, { source, code });
    return code;
  }

  getCompilationSettings(): ts.CompilerOptions {
    return this.compilerOptions;
  }

  getProjectVersion(): string {
    return String(this.projectVersion);
  }

  getScriptFileNames(): string[] {
    return [
      ...this.projectFileNames,
      ...[...this.openDocuments.keys()].map(toVirtualPath),
    ];
  }

  getScriptKind(fileName: string): ts.ScriptKind {
    if (isVirtualPath(fileName) || fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
    if (/\.[cm]?jsx?$/u.test(fileName)) return fileName.endsWith("x") ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
    if (fileName.endsWith(".json")) return ts.ScriptKind.JSON;
    return ts.ScriptKind.TS;
  }

  getScriptVersion(fileName: string): string {
    const path = isVirtualPath(fileName) ? toBtsxPath(fileName) : fileName;
    const open = this.openDocuments.get(path);
    if (open !== undefined) return `open:${open.version}`;
    return String(ts.sys.getModifiedTime?.(path)?.getTime() ?? 0);
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    if (isVirtualPath(fileName)) {
      const code = this.getVirtualCode(toBtsxPath(fileName));
      // A Beast file that does not compile still exists as a module; it just
      // exports nothing TypeScript can see until it is fixed.
      return ts.ScriptSnapshot.fromString(code?.code ?? "export {};\n");
    }
    const content = ts.sys.readFile(fileName);
    return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
  }

  getCurrentDirectory(): string {
    return this.workspaceRoot;
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return ts.getDefaultLibFilePath(options);
  }

  fileExists(path: string): boolean {
    if (isVirtualPath(path)) {
      const btsxPath = toBtsxPath(path);
      return this.openDocuments.has(btsxPath) || ts.sys.fileExists(btsxPath);
    }
    return ts.sys.fileExists(path);
  }

  readFile(path: string, encoding?: string): string | undefined {
    if (isVirtualPath(path)) return this.getScriptSnapshot(path)?.getText(0, Number.MAX_SAFE_INTEGER);
    return ts.sys.readFile(path, encoding);
  }

  readDirectory(
    path: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number,
  ): string[] {
    return ts.sys.readDirectory(path, extensions, exclude, include, depth);
  }

  directoryExists(directoryName: string): boolean {
    return ts.sys.directoryExists(directoryName);
  }

  getDirectories(directoryName: string): string[] {
    return ts.sys.getDirectories(directoryName);
  }

  realpath(path: string): string {
    return isVirtualPath(path) ? path : ts.sys.realpath?.(path) ?? path;
  }

  useCaseSensitiveFileNames(): boolean {
    return ts.sys.useCaseSensitiveFileNames;
  }
}
