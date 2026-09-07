import * as ts from "typescript";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileBeastResult, BeastCompileError, type BeastSourceMap } from "beast-tsrx";
import type { TextDocument } from "vscode-languageserver-textdocument";

export interface CompiledBeastDocument {
  /** Original Beast source code */
  source: string;
  /** Compiled TSRX/TypeScript code */
  tsrxCode: string;
  /** Source map from TSRX back to Beast */
  sourceMap: BeastSourceMap;
  /** Version number for incremental updates */
  version: number;
  /** Last compilation timestamp for cache invalidation */
  compiledAt: number;
}

export interface BeastLanguageServiceHost extends ts.LanguageServiceHost {
  /** Update a Beast document and recompile */
  updateDocument(uri: string, source: string): void;

  /** Remove a document from the virtual file system */
  removeDocument(uri: string): void;

  /** Get the compiled result for a Beast document */
  getCompiledDocument(uri: string): CompiledBeastDocument | undefined;

  /** Force recompilation of all documents */
  invalidateAll(): void;
}

export class BeastTypeScriptHost implements BeastLanguageServiceHost {
  private documents = new Map<string, CompiledBeastDocument>();
  private projectVersion = 0;
  private compilerOptions: ts.CompilerOptions;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.compilerOptions = this.loadCompilerOptions();
  }

  private loadCompilerOptions(): ts.CompilerOptions {
    // Default options optimized for Beast/TSRX analysis
    const defaultOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "octane",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      allowArbitraryExtensions: true,
      resolveJsonModule: true,
    };

    // Try to load tsconfig.json from workspace
    const configPath = ts.findConfigFile(
      this.workspaceRoot,
      ts.sys.fileExists,
      "tsconfig.json",
    );

    if (configPath) {
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      if (!configFile.error) {
        const parsed = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          dirname(configPath),
        );
        return { ...defaultOptions, ...parsed.options };
      }
    }

    return defaultOptions;
  }

  updateDocument(uri: string, source: string): void {
    const existing = this.documents.get(uri);

    // Skip recompilation if source unchanged
    if (existing?.source === source) {
      return;
    }

    try {
      const filePath = uri.startsWith("file:") ? fileURLToPath(uri) : uri;
      const result = compileBeastResult(source, { filename: filePath });

      this.documents.set(uri, {
        source,
        tsrxCode: result.code,
        sourceMap: result.map,
        version: (existing?.version ?? 0) + 1,
        compiledAt: Date.now(),
      });

      this.projectVersion++;
    } catch (error) {
      // Beast parse errors are handled separately by the existing diagnostics
      // Store a minimal entry to track the document
      if (error instanceof BeastCompileError) {
        this.documents.set(uri, {
          source,
          tsrxCode: "", // Empty - no valid TypeScript to analyze
          sourceMap: { version: 3, sources: [], names: [], mappings: "" },
          version: (existing?.version ?? 0) + 1,
          compiledAt: Date.now(),
        });
      }
    }
  }

  removeDocument(uri: string): void {
    if (this.documents.delete(uri)) {
      this.projectVersion++;
    }
  }

  getCompiledDocument(uri: string): CompiledBeastDocument | undefined {
    return this.documents.get(uri);
  }

  invalidateAll(): void {
    this.documents.clear();
    this.projectVersion++;
  }

  // LanguageServiceHost implementation
  getCompilationSettings(): ts.CompilerOptions {
    return this.compilerOptions;
  }

  getScriptFileNames(): string[] {
    // Return virtual .ts paths for all Beast documents
    return Array.from(this.documents.keys()).map((uri) => {
      const path = uri.startsWith("file:") ? fileURLToPath(uri) : uri;
      return path.replace(/\.btsx$/u, ".ts");
    });
  }

  getScriptVersion(fileName: string): string {
    // Map .ts back to .btsx URI
    const btsxPath = fileName.replace(/\.ts$/u, ".btsx");
    const uri = btsxPath.startsWith("/") ? pathToFileURL(btsxPath).href : btsxPath;
    const doc = this.documents.get(uri);
    return doc ? String(doc.version) : "0";
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    // Map virtual .ts filename back to Beast document
    const btsxPath = fileName.replace(/\.ts$/u, ".btsx");
    const uri = btsxPath.startsWith("/") ? pathToFileURL(btsxPath).href : btsxPath;
    const doc = this.documents.get(uri);

    if (doc && doc.tsrxCode.length > 0) {
      return ts.ScriptSnapshot.fromString(doc.tsrxCode);
    }

    // Fall through to real file system for non-Beast files
    if (ts.sys.fileExists(fileName)) {
      const content = ts.sys.readFile(fileName);
      return content ? ts.ScriptSnapshot.fromString(content) : undefined;
    }

    return undefined;
  }

  getCurrentDirectory(): string {
    return this.workspaceRoot;
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return ts.getDefaultLibFilePath(options);
  }

  fileExists(path: string): boolean {
    // Check if it's a virtual Beast file
    const btsxPath = path.replace(/\.ts$/u, ".btsx");
    const uri = btsxPath.startsWith("/") ? pathToFileURL(btsxPath).href : btsxPath;
    if (this.documents.has(uri)) {
      return true;
    }
    return ts.sys.fileExists(path);
  }

  readFile(path: string): string | undefined {
    return ts.sys.readFile(path);
  }

  getProjectVersion(): string {
    return String(this.projectVersion);
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
}
