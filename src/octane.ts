import { compile } from "octane/compiler";
import type { CompileResult } from "octane/compiler";

export type OctaneValidationResult = CompileResult;

export function validateTsrx(
  source: string,
  filename: string,
  mode: "client" | "server" = "client",
): OctaneValidationResult {
  return compile(source, filename, { mode, hmr: false, dev: false });
}
