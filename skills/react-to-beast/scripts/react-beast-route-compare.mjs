#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { auditReactApp } from "./react-beast-audit.mjs";

const COMPARISON_SCHEMA_VERSION = 1;

function usage() {
  return `Usage: react-beast-route-compare <source> <target> [options]

Compare normalized source and Beast target route contracts without executing either project.

Options:
  --json <path|->  Write JSON to a file, or to stdout with -
  --force          Replace an existing JSON file
  -h, --help       Show this help
`;
}

function parseArguments(argv) {
  const options = { source: null, target: null, json: null, force: false, help: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") options.help = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--json") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--json requires a value");
      options.json = value;
      index += 1;
    } else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    else positional.push(argument);
  }
  if (!options.help && positional.length !== 2) throw new Error("Provide exactly one source and one target directory");
  [options.source, options.target] = positional;
  return options;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function routeDescriptor(report, route) {
  const parent = route.parentId
    ? report.routing.manifest.routes.find((candidate) => candidate.id === route.parentId) ?? null
    : null;
  return {
    source: route.source,
    path: route.path.normalized,
    role: route.index ? "index" : route.path.kind === "pathless" ? "pathless" : "route",
    parentPath: parent?.path.normalized ?? null,
    params: route.params,
    search: route.search,
    redirects: route.redirects,
    capabilities: route.capabilities,
  };
}

function descriptorKey(descriptor) {
  return `${descriptor.path ?? "<dynamic>"}\0${descriptor.role}\0${descriptor.parentPath ?? "<root>"}`;
}

function groupRoutes(report) {
  const groups = new Map();
  for (const route of report.routing.manifest.routes) {
    const descriptor = routeDescriptor(report, route);
    const key = descriptorKey(descriptor);
    const entries = groups.get(key) ?? [];
    entries.push(descriptor);
    groups.set(key, entries);
  }
  for (const entries of groups.values()) {
    entries.sort((left, right) => left.source.file.localeCompare(right.source.file) || left.source.line - right.source.line);
  }
  return groups;
}

export function compareRouteReports(sourceReport, targetReport) {
  const sourceGroups = groupRoutes(sourceReport);
  const targetGroups = groupRoutes(targetReport);
  const keys = uniqueSorted([...sourceGroups.keys(), ...targetGroups.keys()]);
  const sourceOnly = [];
  const targetOnly = [];
  const mismatches = [];
  let matched = 0;

  for (const key of keys) {
    const sourceEntries = sourceGroups.get(key) ?? [];
    const targetEntries = targetGroups.get(key) ?? [];
    const pairs = Math.min(sourceEntries.length, targetEntries.length);
    for (let index = 0; index < pairs; index += 1) {
      const source = sourceEntries[index];
      const target = targetEntries[index];
      const sourceParams = JSON.stringify(source.params);
      const targetParams = JSON.stringify(target.params);
      const sourceSearch = JSON.stringify(source.search);
      const targetSearch = JSON.stringify(target.search);
      const sourceRedirects = JSON.stringify(source.redirects);
      const targetRedirects = JSON.stringify(target.redirects);
      const missingCapabilities = source.capabilities.filter((capability) => !target.capabilities.includes(capability));
      const addedCapabilities = target.capabilities.filter((capability) => !source.capabilities.includes(capability));
      if (
        sourceParams === targetParams &&
        sourceSearch === targetSearch &&
        sourceRedirects === targetRedirects &&
        missingCapabilities.length === 0 &&
        addedCapabilities.length === 0
      ) matched += 1;
      else {
        mismatches.push({
          path: source.path,
          role: source.role,
          parentPath: source.parentPath,
          source: source.source,
          target: target.source,
          paramsMatch: sourceParams === targetParams,
          searchMatch: sourceSearch === targetSearch,
          redirectsMatch: sourceRedirects === targetRedirects,
          missingCapabilities,
          addedCapabilities,
        });
      }
    }
    sourceOnly.push(...sourceEntries.slice(pairs));
    targetOnly.push(...targetEntries.slice(pairs));
  }

  const manifestIssues = [];
  if (sourceReport.routing.manifest.status === "partial-review-required") manifestIssues.push("source-manifest-partial");
  if (targetReport.routing.manifest.status === "partial-review-required") manifestIssues.push("target-manifest-partial");
  const reviewCount = sourceOnly.length + targetOnly.length + mismatches.length + manifestIssues.length;
  return {
    schemaVersion: COMPARISON_SCHEMA_VERSION,
    status: reviewCount === 0 ? "matched" : "review-required",
    source: sourceReport.source,
    target: targetReport.source,
    summary: {
      sourceRoutes: sourceReport.routing.manifest.summary.routes,
      targetRoutes: targetReport.routing.manifest.summary.routes,
      matched,
      reviewCount,
    },
    sourceOnly,
    targetOnly,
    mismatches,
    manifestIssues,
    applicationCheckpoints: uniqueSorted([
      ...sourceReport.routing.manifest.applicationCheckpoints,
      ...targetReport.routing.manifest.applicationCheckpoints,
      ...sourceReport.routing.manifest.routes.flatMap((route) => route.checkpoints),
      ...targetReport.routing.manifest.routes.flatMap((route) => route.checkpoints),
    ]),
  };
}

function escapeMarkdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function formatRouteComparison(comparison) {
  const lines = [
    "# Route contract comparison",
    "",
    `Source: \`${comparison.source}\``,
    `Target: \`${comparison.target}\``,
    `Status: ${comparison.status}`,
    "",
    "| Path | Role | Parent | Result | Detail |",
    "|---|---|---|---|---|",
  ];
  for (const route of comparison.sourceOnly) {
    lines.push(`| ${escapeMarkdownCell(route.path ?? "review required")} | ${route.role} | ${escapeMarkdownCell(route.parentPath ?? "—")} | source only | Missing from target |`);
  }
  for (const route of comparison.targetOnly) {
    lines.push(`| ${escapeMarkdownCell(route.path ?? "review required")} | ${route.role} | ${escapeMarkdownCell(route.parentPath ?? "—")} | target only | Not present in source |`);
  }
  for (const mismatch of comparison.mismatches) {
    const details = [
      mismatch.paramsMatch ? null : "params differ",
      mismatch.searchMatch ? null : "search contract differs",
      mismatch.redirectsMatch ? null : "redirect targets differ",
      mismatch.missingCapabilities.length > 0 ? `missing: ${mismatch.missingCapabilities.join(", ")}` : null,
      mismatch.addedCapabilities.length > 0 ? `added: ${mismatch.addedCapabilities.join(", ")}` : null,
    ].filter(Boolean).join("; ");
    lines.push(`| ${escapeMarkdownCell(mismatch.path ?? "review required")} | ${mismatch.role} | ${escapeMarkdownCell(mismatch.parentPath ?? "—")} | mismatch | ${escapeMarkdownCell(details)} |`);
  }
  if (comparison.summary.reviewCount === 0) {
    lines.push(`| — | — | — | matched | ${comparison.summary.matched} normalized route contracts match. |`);
  }
  if (comparison.manifestIssues.length > 0) {
    lines.push("", `Manifest issues: ${comparison.manifestIssues.join(", ")}.`);
  }
  lines.push("", "Run every application checkpoint in both implementations; a static match does not prove runtime parity.");
  return `${lines.join("\n")}\n`;
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const [sourceReport, targetReport] = await Promise.all([
    auditReactApp(options.source),
    auditReactApp(options.target),
  ]);
  const comparison = compareRouteReports(sourceReport, targetReport);
  if (options.json === "-") {
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
    return;
  }
  if (options.json) {
    const outputPath = path.resolve(options.json);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(comparison, null, 2)}\n`, {
      encoding: "utf8",
      flag: options.force ? "w" : "wx",
    });
    process.stdout.write(`Wrote route comparison to ${outputPath}\n`);
    return;
  }
  process.stdout.write(formatRouteComparison(comparison));
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`react-beast-route-compare: ${error.message}\n`);
    process.exitCode = 1;
  });
}
