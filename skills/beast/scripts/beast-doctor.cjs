#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Beast Doctor — bounded, deterministic lexical checker for Beast projects.
 * Reads source without executing or importing target code: 4 MiB per file, no network.
 */
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const MAX_BYTES = 4 * 1024 * 1024;
const BTSX_EXTS = new Set([".btsx", ".tsrx", ".tsx", ".ts"]);
const IGNORED_DIRECTORIES = new Set([
    ".beast",
    ".git",
    "build",
    "coverage",
    "dist",
    "node_modules",
]);
function parseArgs(argv) {
    const targets = [];
    let jsonPath = null;
    let top = 10;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--json" && argv[i + 1])
            jsonPath = argv[++i];
        else if (a === "--top" && argv[i + 1])
            top = parseInt(argv[++i], 10) || 10;
        else if (a === "--help" || a === "-h") {
            console.log(`Usage: beast-doctor.cjs [targets...] [--json PATH] [--top N]`);
            process.exit(0);
        }
        else if (!a.startsWith("-"))
            targets.push(a);
    }
    if (targets.length === 0)
        targets.push(".");
    return { targets, jsonPath, top };
}
async function collectFiles(targets) {
    const out = [];
    for (const t of targets) {
        const abs = (0, node_path_1.resolve)(t);
        try {
            const s = await (0, promises_1.stat)(abs);
            if (s.isDirectory()) {
                await walk(abs, out);
            }
            else if (s.isFile() && BTSX_EXTS.has((0, node_path_1.extname)(abs))) {
                out.push(abs);
            }
        }
        catch {
            // missing target — report later
        }
    }
    return out;
}
async function walk(dir, out) {
    let entries;
    try {
        entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const e of entries) {
        const p = (0, node_path_1.join)(dir, e.name);
        if (e.isDirectory() && !IGNORED_DIRECTORIES.has(e.name))
            await walk(p, out);
        else if (e.isFile() && BTSX_EXTS.has((0, node_path_1.extname)(p)))
            out.push(p);
    }
}
function analyzeContent(content, file) {
    const diagnostics = [];
    const isBtsx = (0, node_path_1.extname)(file) === ".btsx";
    const signals = {
        hasBeastImport: /from\s+["']beast-tsrx/.test(content) || /beastOctane/.test(content),
        hasProps: isBtsx && /^\s*props\s*\{/m.test(content),
        hasBtsxSyntax: isBtsx && /^\s*(component|each|fragment|if|module|props|setup|style|switch|try)\b/m.test(content),
        hasOctaneApi: /use(State|Effect|Memo|Callback|Ref|Id|Transition|DeferredValue)|createRoot|hydrateRoot|createPortal/.test(content),
        hasVitePlugin: /beast-tsrx\/vite/.test(content) && /beastOctane\s*\(/.test(content),
        hasRspackPlugin: /beast-tsrx\/rspack/.test(content) && /beastOctane\s*\(/.test(content),
        hasRsbuildPlugin: /beast-tsrx\/rsbuild/.test(content) && /beastOctane\s*\(/.test(content),
    };
    if (!isBtsx)
        return { diagnostics, signals };
    const lines = createLogicalLines(content, diagnostics);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.content.trim();
        if (trimmed === "fragment" || trimmed === "style") {
            const next = lines[i + 1];
            if (!next || next.indent <= line.indent) {
                diagnostics.push({ code: "empty-body", message: `Empty ${trimmed} at line ${line.line}`, line: line.line, column: line.indent + 1 });
            }
        }
        if (/^props\s*\{\s*\}\s*:/.test(line.content)) {
            diagnostics.push({ code: "empty-props", message: `Empty props at line ${line.line}`, line: line.line, column: line.indent + 1 });
        }
        if (/\(\{\s*[A-Za-z_$][\w$]*\s*\}\)/.test(line.content) && !/\(\{\s*\.\.\./.test(line.content)) {
            diagnostics.push({ code: "non-spread-braces", message: `Bare object in spread position at line ${line.line}`, line: line.line, column: line.indent + 1 });
        }
    }
    for (let i = 1; i < lines.length; i++) {
        const prev = lines[i - 1];
        const cur = lines[i];
        if (cur.indent > prev.indent && cur.indent - prev.indent !== 2) {
            // Two spaces is the project convention; only flag jumps after a template parent.
            if (/^(?:[A-Za-z][\w$:.-]*|[.#][\w-]+|fragment|if\b|each\b|switch\b|try|component\b)/.test(prev.content)) {
                diagnostics.push({ code: "indentation", message: `Conventional child indentation is +2 spaces at line ${cur.line}`, line: cur.line, column: cur.indent + 1 });
            }
        }
    }
    return { diagnostics, signals };
}
function createLogicalLines(content, diagnostics) {
    const logical = [];
    for (const [index, physical] of content.split("\n").entries()) {
        const leading = physical.match(/^[ \t]*/)?.[0] ?? "";
        const line = index + 1;
        if (leading.includes("\t")) {
            diagnostics.push({ code: "tab-indentation", message: `Tabs are not valid BTSX indentation at line ${line}`, line, column: 1 });
            continue;
        }
        const body = physical.slice(leading.length).trimEnd();
        if (body.length === 0 || body.startsWith("//"))
            continue;
        if (body.startsWith("~")) {
            const previous = logical.at(-1);
            if (previous === undefined || leading.length <= previous.indent) {
                diagnostics.push({ code: "orphan-continuation", message: `Continuation must be indented beneath a preceding logical line at line ${line}`, line, column: leading.length + 1 });
                continue;
            }
            const payload = body.slice(1).trim();
            if (payload.length === 0 || payload.startsWith("//"))
                continue;
            previous.content += ` ${payload}`;
            continue;
        }
        logical.push({ content: body, indent: leading.length, line });
    }
    return logical;
}
async function readBoundedText(file, size) {
    if (size <= MAX_BYTES)
        return await (0, promises_1.readFile)(file, "utf8");
    const handle = await (0, promises_1.open)(file, "r");
    try {
        const buffer = Buffer.allocUnsafe(MAX_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, MAX_BYTES, 0);
        return buffer.subarray(0, bytesRead).toString("utf8");
    }
    finally {
        await handle.close();
    }
}
async function analyzeFile(file) {
    try {
        const s = await (0, promises_1.stat)(file);
        const size = s.size;
        const truncated = size > MAX_BYTES;
        const content = await readBoundedText(file, size);
        const { diagnostics, signals } = analyzeContent(content, file);
        return { file: (0, node_path_1.relative)(process.cwd(), file), exists: true, size, truncated, diagnostics, signals };
    }
    catch {
        return { file: (0, node_path_1.relative)(process.cwd(), file), exists: false, size: 0, truncated: false, diagnostics: [{ code: "missing", message: "File not found" }], signals: { hasBeastImport: false, hasProps: false, hasBtsxSyntax: false, hasOctaneApi: false, hasVitePlugin: false, hasRspackPlugin: false, hasRsbuildPlugin: false } };
    }
}
async function main() {
    const { targets, jsonPath, top } = parseArgs(process.argv.slice(2));
    const files = await collectFiles(targets);
    const reports = [];
    for (const f of files)
        reports.push(await analyzeFile(f));
    // Also check vite.config.ts and package.json at targets
    for (const t of targets) {
        const abs = (0, node_path_1.resolve)(t);
        try {
            const s = await (0, promises_1.stat)(abs);
            const dir = s.isDirectory() ? abs : (0, node_path_1.resolve)(abs, "..");
            for (const extra of [
                "vite.config.ts",
                "vite.config.js",
                "vite.config.mts",
                "rspack.config.ts",
                "rspack.config.js",
                "rspack.config.mjs",
                "rsbuild.config.ts",
                "rsbuild.config.js",
                "octane.config.ts",
                "package.json",
                "tsconfig.json",
            ]) {
                const p = (0, node_path_1.join)(dir, extra);
                try {
                    await (0, promises_1.stat)(p);
                    if (!reports.some((r) => (0, node_path_1.resolve)(r.file) === p))
                        reports.push(await analyzeFile(p));
                }
                catch { }
            }
        }
        catch { }
    }
    reports.sort((a, b) => b.diagnostics.length - a.diagnostics.length);
    console.log(`Beast Doctor — ${reports.length} files scanned, ${reports.filter((r) => r.diagnostics.length > 0).length} with diagnostics`);
    for (const r of reports.slice(0, top)) {
        if (r.diagnostics.length === 0)
            continue;
        console.log(`\n${r.file} (${r.diagnostics.length} issues)`);
        for (const d of r.diagnostics.slice(0, 5))
            console.log(`  ${d.code}: ${d.message}${d.line ? ` [${d.line}:${d.column}]` : ""}`);
    }
    const beastFiles = reports.filter((r) => r.signals.hasBtsxSyntax || r.signals.hasProps).length;
    const buildConfigs = reports.filter((r) => r.signals.hasVitePlugin || r.signals.hasRspackPlugin || r.signals.hasRsbuildPlugin).length;
    console.log(`\nSignals: ${beastFiles} BTSX files, ${buildConfigs} Beast build configs, ${reports.filter((r) => r.signals.hasOctaneApi).length} Octane APIs`);
    if (jsonPath) {
        const json = JSON.stringify({ targets, reports, scanned: reports.length, top }, null, 2);
        if (jsonPath === "-")
            console.log(json);
        else {
            const { writeFile } = await import("node:fs/promises");
            await writeFile((0, node_path_1.resolve)(jsonPath), json, "utf8");
            console.log(`\nJSON report: ${(0, node_path_1.resolve)(jsonPath)}`);
        }
    }
}
main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});
