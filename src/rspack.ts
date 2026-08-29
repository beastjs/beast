import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OctaneRspackPlugin,
  type OctaneRspackLoaderOptions,
  type OctaneRspackPluginOptions,
} from "@octanejs/rspack-plugin";
import type { Compiler, RspackPluginInstance } from "@rspack/core";
import type { ProjectComponentOptions } from "./project.js";

export interface BeastRspackOptions {
  root?: string;
  components?: Readonly<Record<string, ProjectComponentOptions>>;
  /**
   * The complete adapter forwards these options to Octane's class plugin.
   * Beast-generated TSRX consumes the compiler subset; graph-level options
   * such as `parallel` and `cssModuleConstants` remain owned by Octane.
   */
  octane?: OctaneRspackPluginOptions;
}

const loaderPath = fileURLToPath(new URL(
  import.meta.url.endsWith(".ts") ? "./rspack-loader.ts" : "./rspack-loader.js",
  import.meta.url,
));

/** Compile `.btsx` resources before Rspack parses the resulting JavaScript. */
export class BeastRspackPlugin implements RspackPluginInstance {
  readonly options: Readonly<BeastRspackOptions>;

  constructor(options: BeastRspackOptions = {}) {
    this.options = Object.freeze({
      ...options,
      ...(options.components === undefined
        ? {}
        : { components: Object.freeze({ ...options.components }) }),
    });
  }

  apply(compiler: Compiler): void {
    const compilerRoot = compiler.options.context ?? process.cwd();
    const configuredRoot = this.options.root ?? this.options.octane?.root;
    const root = realRoot(configuredRoot === undefined
      ? compilerRoot
      : isAbsolute(configuredRoot)
        ? configuredRoot
        : resolve(compilerRoot, configuredRoot));

    compiler.options.resolve ??= {};
    const extensions = compiler.options.resolve.extensions ?? [".js", ".json", ".wasm"];
    compiler.options.resolve.extensions = extensions.includes(".btsx")
      ? extensions
      : [".btsx", ...extensions];

    const extensionAlias = compiler.options.resolve.extensionAlias ?? {};
    const configuredTsrx = extensionAlias[".tsrx"];
    const tsrxAliases = configuredTsrx === undefined
      ? [".tsrx"]
      : Array.isArray(configuredTsrx)
        ? configuredTsrx
        : [configuredTsrx];
    compiler.options.resolve.extensionAlias = {
      ...extensionAlias,
      ".tsrx": [...new Set([...tsrxAliases, ".btsx"])],
    };

    compiler.options.module.rules ??= [];
    compiler.options.module.rules.push({
      test: /\.btsx$/iu,
      type: "javascript/auto",
      enforce: "pre",
      use: [{
        loader: loaderPath,
        options: {
          root,
          ...(this.options.components === undefined
            ? {}
            : { components: this.options.components }),
          ...(this.options.octane === undefined
            ? {}
            : { octane: beastCompilerOptions(this.options.octane) }),
        },
      }],
    });
  }
}

/** Beast-only Rspack transform for configurations that already install Octane. */
export function beast(options: BeastRspackOptions = {}): BeastRspackPlugin {
  return new BeastRspackPlugin(options);
}

/** Complete Rspack integration for mixed `.btsx` and native Octane sources. */
export function beastOctane(options: BeastRspackOptions = {}): RspackPluginInstance {
  return {
    apply(compiler) {
      new OctaneRspackPlugin({
        ...options.octane,
        ...(options.root === undefined ? {} : { root: options.root }),
      }).apply(compiler);
      new BeastRspackPlugin(options).apply(compiler);
    },
  };
}

function realRoot(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function beastCompilerOptions(
  options: OctaneRspackPluginOptions,
): OctaneRspackLoaderOptions {
  return {
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.hmr === undefined ? {} : { hmr: options.hmr }),
    ...(options.dev === undefined ? {} : { dev: options.dev }),
    ...(options.profile === undefined ? {} : { profile: options.profile }),
    ...(options.strong === undefined ? {} : { strong: options.strong }),
    ...(options.nativeReads === undefined ? {} : { nativeReads: options.nativeReads }),
    ...(options.exclude === undefined ? {} : { exclude: options.exclude }),
    ...(options.renderers === undefined ? {} : { renderers: options.renderers }),
    ...(options.requireDirective === undefined
      ? {}
      : { requireDirective: options.requireDirective }),
    ...(options.universalRuntime === undefined
      ? {}
      : { universalRuntime: options.universalRuntime }),
  };
}
