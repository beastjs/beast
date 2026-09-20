declare module "octane/compiler/bundler" {
  import type { CompileOptions, CompileResult } from "octane/compiler";

  export interface OctaneBundlerTransformResult extends CompileResult {
    kind: string;
    dependencies: string[];
    missingDependencies: string[];
  }

  export interface OctaneBundlerCompiler {
    transform(
      source: string,
      id: string,
      options?: {
        environment?: "client" | "server";
        hmr?: boolean | "vite" | "webpack";
        dev?: boolean;
        profile?: boolean;
        strong?: boolean;
      },
    ): OctaneBundlerTransformResult | null;
    invalidate(path?: string): void;
  }

  export function createOctaneCompiler(options?: {
    root?: string;
    environment?: "client" | "server";
    hmr?: boolean | "vite" | "webpack";
    dev?: boolean;
    profile?: boolean;
    strong?: boolean;
    knownAttributeSpreads?: CompileOptions["knownAttributeSpreads"];
    universalRuntime?: CompileOptions["universalRuntime"];
    exclude?: string[];
    renderers?: import("octane/compiler/vite").OctaneRendererConfigOptions;
    requireDirective?: boolean;
    warn?: (message: string) => void;
  }): OctaneBundlerCompiler;
}
