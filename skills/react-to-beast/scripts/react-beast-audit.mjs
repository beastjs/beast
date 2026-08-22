#!/usr/bin/env node

import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = 3;
const ROUTE_MANIFEST_VERSION = 1;
const DEFAULT_MAX_FILES = 20_000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_REPORTED_PATHS = 500;
const MAX_REPORTED_FINDINGS = 2_000;
const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".btsx",
  ".tsrx",
  ".css",
  ".scss",
  ".sass",
  ".less",
]);
const IGNORED_DIRECTORIES = new Set([
  ".beast",
  ".git",
  ".next",
  ".output",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "vendor",
]);

const BINDING_CANDIDATES = new Map([
  ["@apollo/client", { candidate: "@octanejs/apollo-client", category: "data" }],
  ["@base-ui-components/react", { candidate: "@octanejs/base-ui", category: "ui" }],
  ["@dnd-kit/core", { candidate: "@octanejs/dnd-kit", category: "interaction" }],
  ["@floating-ui/react", { candidate: "@octanejs/floating-ui", category: "ui" }],
  ["@mantine/hooks", { candidate: "@octanejs/mantine-hooks", category: "hooks" }],
  ["@mdx-js/react", { candidate: "@octanejs/mdx", category: "content" }],
  ["@phosphor-icons/react", { candidate: "@octanejs/phosphor-icons", category: "icons" }],
  ["@radix-ui/react", { candidate: "@octanejs/radix", category: "ui" }],
  ["@react-spring/web", { candidate: "@octanejs/spring", category: "animation" }],
  ["@react-three/drei", { candidate: "@octanejs/drei", category: "3d" }],
  ["@react-three/fiber", { candidate: "@octanejs/three", category: "3d" }],
  ["@reduxjs/toolkit", { candidate: "@octanejs/redux-toolkit", category: "state" }],
  ["@tanstack/react-form", { candidate: "@octanejs/tanstack-form", category: "forms" }],
  ["@tanstack/react-query", { candidate: "@octanejs/tanstack-query", category: "data" }],
  ["@tanstack/react-router", { candidate: "@octanejs/tanstack-router", category: "routing" }],
  ["@tanstack/react-store", { candidate: "@octanejs/tanstack-store", category: "state" }],
  ["@tanstack/react-table", { candidate: "@octanejs/tanstack-table", category: "data-view" }],
  ["@tanstack/react-virtual", { candidate: "@octanejs/tanstack-virtual", category: "data-view" }],
  ["@testing-library/react", { candidate: "@octanejs/testing-library", category: "testing" }],
  ["@xstate/react", { candidate: "@octanejs/xstate", category: "state" }],
  ["@zag-js/react", { candidate: "@octanejs/zag", category: "ui" }],
  ["cmdk", { candidate: "@octanejs/cmdk", category: "ui" }],
  ["embla-carousel-react", { candidate: "@octanejs/embla-carousel", category: "interaction" }],
  ["framer-motion", { candidate: "@octanejs/motion", category: "animation" }],
  ["jotai", { candidate: "@octanejs/jotai", category: "state" }],
  ["lucide-react", { candidate: "@octanejs/lucide", category: "icons" }],
  ["mobx-react-lite", { candidate: "@octanejs/mobx", category: "state" }],
  ["motion", { candidate: "@octanejs/motion", category: "animation" }],
  ["react-aria-components", { candidate: "@octanejs/aria", category: "ui" }],
  ["react-colorful", { candidate: "@octanejs/colorful", category: "ui" }],
  ["react-day-picker", { candidate: "@octanejs/day-picker", category: "ui" }],
  ["react-draggable", { candidate: "@octanejs/draggable", category: "interaction" }],
  ["react-dropzone", { candidate: "@octanejs/dropzone", category: "forms" }],
  ["react-error-boundary", { candidate: "@octanejs/react-error-boundary", category: "boundaries" }],
  ["react-hook-form", { candidate: "@octanejs/hook-form", category: "forms" }],
  ["react-i18next", { candidate: "@octanejs/i18next", category: "content" }],
  ["react-map-gl", { candidate: "@octanejs/react-map-gl", category: "data-view" }],
  ["react-popper", { candidate: "@octanejs/popper", category: "ui" }],
  ["react-redux", { candidate: "@octanejs/redux", category: "state" }],
  ["react-resizable-panels", { candidate: "@octanejs/resizable-panels", category: "ui" }],
  ["react-router", { candidate: "@octanejs/remix-router", category: "routing" }],
  ["react-router-dom", { candidate: "@octanejs/remix-router", category: "routing" }],
  ["react-textarea-autosize", { candidate: "@octanejs/textarea-autosize", category: "forms" }],
  ["react-transition-group", { candidate: "@octanejs/transition-group", category: "animation" }],
  ["recharts", { candidate: "@octanejs/recharts", category: "data-view" }],
  ["sonner", { candidate: "@octanejs/sonner", category: "ui" }],
  ["styled-components", { candidate: "@octanejs/styled-components", category: "styling" }],
  ["swr", { candidate: "@octanejs/swr", category: "data" }],
  ["usehooks-ts", { candidate: "@octanejs/usehooks-ts", category: "hooks" }],
  ["valtio", { candidate: "@octanejs/valtio", category: "state" }],
  ["vaul", { candidate: "@octanejs/vaul", category: "ui" }],
  ["zustand", { candidate: "@octanejs/zustand", category: "state" }],
]);

const BINDING_PREFIX_CANDIDATES = [
  { prefix: "@radix-ui/react-", candidate: "@octanejs/radix", category: "ui" },
];

const CSS_IN_JS_PACKAGES = new Set([
  "@compiled/react",
  "@emotion/react",
  "@emotion/styled",
  "@stitches/react",
  "@vanilla-extract/css",
  "linaria",
  "styled-components",
  "styled-jsx",
]);

const KNOWN_REACT_PACKAGES = new Set([
  "react",
  "react-dom",
  "react-is",
  "react-refresh",
  "react-scripts",
  "next",
  "vite",
  "@vitejs/plugin-react",
  "@vitejs/plugin-react-swc",
  "@remix-run/dev",
  "@remix-run/node",
  "@remix-run/react",
  "@react-router/dev",
  ...BINDING_CANDIDATES.keys(),
]);

const HOOK_NAMES = [
  "useActionState",
  "useCallback",
  "useContext",
  "useDeferredValue",
  "useEffect",
  "useEffectEvent",
  "useFormStatus",
  "useId",
  "useImperativeHandle",
  "useInsertionEffect",
  "useLayoutEffect",
  "useMemo",
  "useOptimistic",
  "useReducer",
  "useRef",
  "useState",
  "useSyncExternalStore",
  "useTransition",
];

const REACT_API_NAMES = [
  "cloneElement",
  "createContext",
  "createPortal",
  "createRef",
  "forwardRef",
  "lazy",
  "memo",
  "startTransition",
  "use",
];

const TEXT_INPUT_TYPES = new Set(["", "email", "number", "password", "search", "tel", "text", "url"]);

const MATRIX_CHECKS = {
  state: {
    id: "state-update",
    scenario: "Trigger each state transition, including repeated and same-value updates.",
    expected: "The intended state commits without resetting unrelated local state.",
  },
  effect: {
    id: "effect-ownership",
    scenario: "Mount, update captured values, unmount, and remount the component.",
    expected: "External resources connect at the intended times and every ownership episode cleans up once.",
  },
  text: {
    id: "text-every-edit",
    scenario: "Type, paste, delete, and perform an IME composition in each text-entry control.",
    expected: "Controlled state follows every native input event without interrupting composition.",
  },
  checkable: {
    id: "checkable-activation",
    scenario: "Toggle with pointer and keyboard, including any rejected/cancelled transition.",
    expected: "Checked state and cancellation follow the browser click → input → change timeline.",
  },
  select: {
    id: "select-change",
    scenario: "Change the selection with keyboard and pointer, then reset the form.",
    expected: "The selected value, change handler, and reset behavior match the source contract.",
  },
  uncontrolled: {
    id: "uncontrolled-reset",
    scenario: "Edit the control, rerender its owner, and reset the form.",
    expected: "Initial defaults do not overwrite user edits and native reset restores the expected value.",
  },
  form: {
    id: "form-submit",
    scenario: "Submit by button and Enter across valid, invalid, pending, success, and failure states.",
    expected: "Validation, prevention, payload, focus, pending UI, errors, and reset behavior remain equivalent.",
  },
  ref: {
    id: "ref-lifecycle",
    scenario: "Mount, focus or measure, replace the host node, and unmount.",
    expected: "Object and callback refs attach to the right node and detach or run cleanup exactly once.",
  },
  context: {
    id: "context-provider-update",
    scenario: "Render without a provider, then update and nest provider values.",
    expected: "Consumers receive the correct default and nearest committed provider value.",
  },
  portal: {
    id: "portal-ownership",
    scenario: "Mount into the target, exercise capture/bubble and stopPropagation, then unmount.",
    expected: "DOM ownership, logical ancestry, event order, focus, and cleanup match the source behavior.",
  },
  boundary: {
    id: "pending-error-retry",
    scenario: "Exercise fulfilled, pending, rejected, fallback, and retry/reset paths.",
    expected: "The nearest boundary owns the same loading/error state and recovery behavior.",
  },
  transition: {
    id: "urgent-transition-work",
    scenario: "Update urgent input state while starting a slower transition and suspension.",
    expected: "Typing stays immediate, useful prior UI remains visible, and pending status is accurate.",
  },
  hydration: {
    id: "hydration-adoption",
    scenario: "Hydrate server HTML, interact before/while activation, and verify node identity.",
    expected: "HTML is adopted as intended, events replay where configured, and effects/refs begin only after activation.",
  },
  memo: {
    id: "memoization-parity",
    scenario: "Rerender with stable and changed captures, including any identity-sensitive consumer.",
    expected: "Recomputation and callback/component identity change at the same semantic boundaries as the source.",
  },
};

const ROUTE_TARGETS = {
  "react-router-declarative": {
    protocol: "react-router",
    mode: "declarative",
    candidate: "@octanejs/remix-router",
    status: "binding-review-required",
    reason: "Declarative routing is available through the Octane binding; verify the pinned React Router and Octane surfaces before swapping imports.",
  },
  "react-router-data": {
    protocol: "react-router",
    mode: "data",
    candidate: "@octanejs/remix-router",
    status: "binding-review-required",
    reason: "Data routers are available through the Octane binding, but loader/action execution and SSR ownership must be selected explicitly.",
  },
  "react-router-framework": {
    protocol: "react-router",
    mode: "framework",
    candidate: "data-router-or-tanstack-start",
    status: "rewrite-required",
    reason: "The Octane React Router binding intentionally stubs Framework Mode; convert route modules to a reviewed data-router target or choose an Octane full-app router.",
  },
  "tanstack-code": {
    protocol: "tanstack-router",
    mode: "code",
    candidate: "@octanejs/tanstack-router",
    status: "binding-review-required",
    reason: "Code-based route trees can use the Octane binding after version, type, SSR, and behavior review.",
  },
  "tanstack-file": {
    protocol: "tanstack-router",
    mode: "file",
    candidate: "@octanejs/tanstack-start",
    status: "generator-review-required",
    reason: "File routing needs the TSRX-aware generator integration owned by Octane TanStack Start, or an explicit conversion to a code route tree.",
  },
  remix: {
    protocol: "remix",
    mode: "route-modules",
    candidate: "react-router-data-or-tanstack-start",
    status: "rewrite-required",
    reason: "Remix framework route modules and request handling are not a direct binding swap; choose and verify a client/server target per route contract.",
  },
  "next-app": {
    protocol: "nextjs",
    mode: "app",
    candidate: "server-boundary-plan",
    status: "planned-v0.4",
    reason: "Next App Router server, cache, streaming, and route-handler contracts require the dedicated server-boundary phase.",
  },
  "next-pages": {
    protocol: "nextjs",
    mode: "pages",
    candidate: "server-boundary-plan",
    status: "planned-v0.4",
    reason: "Next Pages Router data methods, document ownership, and API routes require the dedicated server-boundary phase.",
  },
  "custom-history": {
    protocol: "custom-history",
    mode: "manual",
    candidate: "explicit-route-contract",
    status: "rewrite-required",
    reason: "Manual history behavior must be modeled before selecting or implementing a target router.",
  },
};

const ROUTE_FEATURE_APIS = [
  { feature: "outlet", expression: /\bOutlet\b/g },
  { feature: "link", expression: /\b(?:Link|NavLink|Navigate|useNavigate)\b/g },
  { feature: "params", expression: /\b(?:useParams|params\b)/g },
  { feature: "search", expression: /\b(?:useSearchParams|useSearch|validateSearch|searchSchema)\b/g },
  { feature: "redirect", expression: /\bredirect\s*\(/g },
  { feature: "error", expression: /\b(?:ErrorBoundary|errorElement|errorComponent|useRouteError|CatchBoundary)\b/g },
  { feature: "pending", expression: /\b(?:HydrateFallback|hydrateFallbackElement|pendingComponent|useNavigation)\b/g },
  { feature: "not-found", expression: /\b(?:notFound|notFoundComponent|defaultNotFoundComponent)\b/g },
  { feature: "blocker", expression: /\b(?:useBlocker|unstable_usePrompt|Block)\b/g },
  { feature: "scroll-restoration", expression: /\bScrollRestoration\b/g },
  { feature: "revalidation", expression: /\b(?:useRevalidator|shouldRevalidate|router\.invalidate)\b/g },
  { feature: "mutation", expression: /\b(?:Form|useFetcher|useFetchers|useSubmit)\b/g },
  { feature: "middleware", expression: /\b(?:middleware|beforeLoad)\b/g },
  { feature: "metadata", expression: /\b(?:Meta|Links|meta|links|headers)\b/g },
];

function usage() {
  return `Usage: react-beast-audit [source] [options]

Audit a React application without installing dependencies or executing its scripts.

Options:
  --style <tailwind|css>  Requested Beast styling target (default: tailwind)
  --json <path|->        Write JSON to a file, or to stdout with -
  --matrix <path|->      Write the interactive parity matrix as Markdown
  --routes <path|->      Write the normalized route manifest as Markdown
  --max-files <number>   Stop after this many candidate files (default: ${DEFAULT_MAX_FILES})
  --force                Replace an existing output file
  -h, --help             Show this help
`;
}

function parseArguments(argv) {
  const options = {
    source: ".",
    style: "tailwind",
    json: null,
    matrix: null,
    routes: null,
    force: false,
    maxFiles: DEFAULT_MAX_FILES,
    help: false,
  };
  let sawSource = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else if (argument === "--force") {
      options.force = true;
    } else if (
      argument === "--style" ||
      argument === "--json" ||
      argument === "--matrix" ||
      argument === "--routes" ||
      argument === "--max-files"
    ) {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--style") options.style = value;
      if (argument === "--json") options.json = value;
      if (argument === "--matrix") options.matrix = value;
      if (argument === "--routes") options.routes = value;
      if (argument === "--max-files") options.maxFiles = Number(value);
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (!sawSource) {
      options.source = argument;
      sawSource = true;
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }

  if (!new Set(["tailwind", "css"]).has(options.style)) {
    throw new Error("--style must be either tailwind or css");
  }
  if (!Number.isSafeInteger(options.maxFiles) || options.maxFiles < 1) {
    throw new Error("--max-files must be a positive integer");
  }
  if ([options.json, options.matrix, options.routes].filter((value) => value !== null).length > 1) {
    throw new Error("--json, --matrix, and --routes are separate output modes; choose one");
  }
  return options;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function increment(counter, key, amount = 1) {
  counter[key] = (counter[key] ?? 0) + amount;
}

function findCallSites(text, name) {
  const sites = [];
  const expression = new RegExp(`\\b${name}\\b`, "g");
  for (const match of text.matchAll(expression)) {
    let cursor = match.index + name.length;
    while (/\s/.test(text[cursor] ?? "")) cursor += 1;
    if (text[cursor] === "<") {
      let depth = 0;
      let quote = null;
      for (; cursor < text.length; cursor += 1) {
        const character = text[cursor];
        const previous = text[cursor - 1];
        if (quote !== null) {
          if (character === quote && previous !== "\\") quote = null;
          continue;
        }
        if (character === '"' || character === "'" || character === "`") {
          quote = character;
          continue;
        }
        if (character === "<") depth += 1;
        if (character === ">") {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
        }
      }
      while (/\s/.test(text[cursor] ?? "")) cursor += 1;
    }
    if (text[cursor] === "(") sites.push({ offset: match.index, openParen: cursor });
  }
  return sites;
}

function findCallOffsets(text, name) {
  return findCallSites(text, name).map((site) => site.offset);
}

function countTopLevelArguments(text, openParen) {
  let parentheses = 1;
  let braces = 0;
  let brackets = 0;
  let quote = null;
  let commas = 0;
  let hasContent = false;

  for (let cursor = openParen + 1; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    const previous = text[cursor - 1];
    if (quote !== null) {
      if (character === quote && previous !== "\\") quote = null;
      if (parentheses === 1 && braces === 0 && brackets === 0 && !/\s/.test(character)) hasContent = true;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      if (parentheses === 1 && braces === 0 && brackets === 0) hasContent = true;
      continue;
    }
    if (character === "{") braces += 1;
    else if (character === "}") braces = Math.max(0, braces - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
    else if (character === "(") parentheses += 1;
    else if (character === ")") {
      parentheses -= 1;
      if (parentheses === 0) break;
    } else if (character === "," && parentheses === 1 && braces === 0 && brackets === 0) {
      commas += 1;
      continue;
    }
    if (parentheses === 1 && braces === 0 && brackets === 0 && !/\s/.test(character)) hasContent = true;
  }
  return hasContent ? commas + 1 : 0;
}

function makeLineLocator(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }

  return (offset) => {
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= offset) low = middle;
      else high = middle;
    }
    return low + 1;
  };
}

function createFindingCollector() {
  return { count: 0, items: [], keys: new Set(), codes: new Set(), severities: new Set() };
}

function addFinding(collector, finding) {
  const key = `${finding.code}\0${finding.file}\0${finding.line}`;
  if (collector.keys.has(key)) return;
  collector.keys.add(key);
  collector.codes.add(finding.code);
  collector.severities.add(finding.severity);
  collector.count += 1;
  if (collector.items.length < MAX_REPORTED_FINDINGS) collector.items.push(finding);
}

function addInteractiveSignal(interactive, file, signal) {
  const signals = interactive.signalsByFile.get(file) ?? new Set();
  signals.add(signal);
  interactive.signalsByFile.set(file, signals);
}

function addLocation(locations, file, line, kind) {
  locations.push({ file, line, kind });
}

function scanOpeningTags(text) {
  const tags = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf("<", cursor);
    if (start === -1) break;
    const first = text[start + 1];
    if (!first || first === "/" || first === ">" || first === "!" || first === "?") {
      cursor = start + 1;
      continue;
    }

    const nameMatch = text.slice(start + 1).match(/^[A-Za-z][A-Za-z0-9:._-]*/);
    if (!nameMatch) {
      cursor = start + 1;
      continue;
    }

    let quote = null;
    let braceDepth = 0;
    let end = start + 1 + nameMatch[0].length;
    for (; end < text.length; end += 1) {
      const character = text[end];
      const previous = text[end - 1];
      if (quote !== null) {
        if (character === quote && previous !== "\\") quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "{") {
        braceDepth += 1;
        continue;
      }
      if (character === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }
      if (character === ">" && braceDepth === 0) break;
    }

    if (end < text.length) {
      tags.push({ name: nameMatch[0], offset: start, source: text.slice(start, end + 1) });
      cursor = end + 1;
    } else {
      cursor = start + 1;
    }
  }
  return tags;
}

function hasAttribute(tag, name) {
  return new RegExp(`(?:^|\\s)${name}(?:\\s*=|\\s|/?>)`, "i").test(tag);
}

function hasStaticTrueAttribute(tag, name) {
  const match = new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(\\{[^}]*\\}|["'][^"']*["']))?(?=\\s|/?>)`, "i").exec(tag);
  if (!match) return false;
  if (match[1] === undefined) return true;
  return !/^\{\s*(?:false|null|undefined)\s*\}$/i.test(match[1]);
}

function staticStringAttribute(tag, name) {
  return new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1] ?? null;
}

function bindingCandidateFor(name) {
  const exact = BINDING_CANDIDATES.get(name);
  if (exact) return exact;
  return BINDING_PREFIX_CANDIDATES.find((entry) => name.startsWith(entry.prefix)) ?? null;
}

function matchesPackagePattern(name) {
  return (
    name.startsWith("react-") ||
    name.endsWith("-react") ||
    name.includes("/react-") ||
    name.endsWith("/react")
  );
}

async function collectCandidateFiles(root, maxFiles) {
  const files = [];
  const skipped = {
    ignoredDirectories: 0,
    symlinks: 0,
    oversizedFiles: 0,
  };

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        throw new Error(`Candidate file limit reached (${maxFiles}). Increase --max-files after reviewing the source scope.`);
      }

      const absolutePath = path.join(directory, entry.name);
      const relativePath = toPosix(path.relative(root, absolutePath));

      if (entry.isSymbolicLink()) {
        skipped.symlinks += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          skipped.ignoredDirectories += 1;
          continue;
        }
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || entry.name.startsWith(".env")) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (entry.name !== "package.json" && !SOURCE_EXTENSIONS.has(extension)) continue;

      const info = await lstat(absolutePath);
      if (info.size > MAX_FILE_BYTES) {
        skipped.oversizedFiles += 1;
        continue;
      }
      files.push({ absolutePath, relativePath, extension, size: info.size });
    }
  }

  await visit(root);
  return { files, skipped };
}

function addRouteSignal(routeSignals, id, file, signal) {
  const current = routeSignals.get(id) ?? { files: new Set(), signals: new Set() };
  if (file) current.files.add(file);
  if (signal) current.signals.add(signal);
  routeSignals.set(id, current);
}

function createRoutingCollector() {
  return {
    records: [],
    recordKeys: new Set(),
    findings: createFindingCollector(),
    moduleFeatures: new Map(),
    moduleSearchKeys: new Map(),
    moduleRedirects: new Map(),
    sourceFiles: new Set(),
    parsedRouteArrays: new Set(),
  };
}

function findDelimitedEnd(text, start, open, close) {
  if (text[start] !== open) return -1;
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let cursor = start; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    const next = text[cursor + 1];
    const previous = text[cursor - 1];

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        cursor += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (character === quote && previous !== "\\") quote = null;
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      cursor += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      cursor += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function splitTopLevelRanges(text, start, end) {
  const ranges = [];
  let segmentStart = start;
  let parentheses = 0;
  let braces = 0;
  let brackets = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let cursor = start; cursor < end; cursor += 1) {
    const character = text[cursor];
    const next = text[cursor + 1];
    const previous = text[cursor - 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        cursor += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (character === quote && previous !== "\\") quote = null;
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      cursor += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      cursor += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "{") braces += 1;
    else if (character === "}") braces = Math.max(0, braces - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
    else if (character === "," && parentheses === 0 && braces === 0 && brackets === 0) {
      ranges.push({ start: segmentStart, end: cursor });
      segmentStart = cursor + 1;
    }
  }
  ranges.push({ start: segmentStart, end });
  return ranges;
}

function trimRange(text, range) {
  let start = range.start;
  let end = range.end;
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  return { start, end, text: text.slice(start, end) };
}

function callArguments(text, openParen) {
  const closeParen = findDelimitedEnd(text, openParen, "(", ")");
  if (closeParen === -1) return null;
  return {
    closeParen,
    arguments: splitTopLevelRanges(text, openParen + 1, closeParen).map((range) => trimRange(text, range)),
  };
}

function parseStaticString(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) return null;
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    if (trimmed[index] === quote && trimmed[index - 1] !== "\\") return null;
  }
  return trimmed.slice(1, -1).replace(/\\([\\"'])/g, "$1");
}

function parseObjectProperties(text, objectStart, objectEnd) {
  const properties = new Map();
  for (const range of splitTopLevelRanges(text, objectStart + 1, objectEnd)) {
    const trimmed = trimRange(text, range);
    const match = /^(?:([A-Za-z_$][\w$]*)|(["'])([^"']+)\2)\s*:/.exec(trimmed.text);
    if (!match) continue;
    const name = match[1] ?? match[3];
    const colonOffset = trimmed.start + match[0].lastIndexOf(":");
    properties.set(name, trimRange(text, { start: colonOffset + 1, end: trimmed.end }));
  }
  return properties;
}

function assignedIdentifier(text, callStart) {
  const prefix = text.slice(Math.max(0, callStart - 240), callStart);
  return /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*$/.exec(prefix)?.[1] ?? null;
}

function importedModuleForSymbol(text, symbol) {
  if (!symbol) return null;
  for (const match of text.matchAll(/\bimport\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
    const clause = match[1].trim();
    const defaultImport = /^([A-Za-z_$][\w$]*)/.exec(clause)?.[1] ?? null;
    if (defaultImport === symbol) return match[2];
    const named = /\{([\s\S]*?)\}/.exec(clause)?.[1] ?? "";
    for (const entry of named.split(",")) {
      const parts = entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if ((parts[1] ?? parts[0]) === symbol) return match[2];
    }
  }
  return null;
}

function relatedModulesFromProperties(text, properties) {
  const symbols = [];
  for (const name of [
    "Component",
    "ErrorBoundary",
    "HydrateFallback",
    "component",
    "errorComponent",
    "pendingComponent",
    "notFoundComponent",
  ]) {
    const symbol = /^([A-Za-z_$][\w$]*)$/.exec(properties.get(name)?.text ?? "")?.[1];
    if (symbol) symbols.push(symbol);
  }
  for (const name of ["element", "errorElement", "hydrateFallbackElement"]) {
    const symbol = /<([A-Z][A-Za-z0-9_$]*)\b/.exec(properties.get(name)?.text ?? "")?.[1];
    if (symbol) symbols.push(symbol);
  }
  return uniqueSorted(symbols.map((symbol) => importedModuleForSymbol(text, symbol)).filter(Boolean));
}

function searchKeysFromText(text) {
  const keys = new Set();
  const variables = [];
  for (const match of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*useSearch\s*\(/g)) variables.push(match[1]);
  for (const match of text.matchAll(/\b(?:const|let|var)\s*\[\s*([A-Za-z_$][\w$]*)[^\]]*\]\s*=\s*useSearchParams\s*\(/g)) variables.push(match[1]);
  for (const variable of variables) {
    const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const match of text.matchAll(new RegExp(`\\b${escaped}\\.get\\s*\\(\\s*["']([A-Za-z0-9_.-]+)["']`, "g"))) {
      keys.add(match[1]);
    }
    for (const match of text.matchAll(new RegExp(`\\b${escaped}\\.([A-Za-z_$][\\w$]*)`, "g"))) {
      if (!["append", "delete", "get", "has", "set", "sort", "toString"].includes(match[1])) keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

function searchKeysFromProperties(properties) {
  const validator = properties.get("validateSearch")?.text;
  if (!validator) return [];
  const body = /=>\s*\(\s*\{([\s\S]*?)\}\s*\)/.exec(validator)?.[1]
    ?? /=>\s*\{([\s\S]*?)\}/.exec(validator)?.[1]
    ?? /return\s+\{([\s\S]*?)\}/.exec(validator)?.[1]
    ?? "";
  const keys = [];
  for (const match of body.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)) keys.push(match[1]);
  return uniqueSorted(keys);
}

function redirectTargetsFromText(text) {
  const targets = [];
  for (const match of text.matchAll(/\bredirect\s*\(\s*["']([^"']+)["']/g)) targets.push(normalizeRoutePattern(match[1]));
  for (const match of text.matchAll(/\bredirect\s*\(\s*\{[\s\S]*?\bto\s*:\s*["']([^"']+)["']/g)) {
    targets.push(normalizeRoutePattern(match[1]));
  }
  return uniqueSorted(targets);
}

function normalizeRoutePattern(pattern) {
  if (pattern === null) return null;
  const normalizedSegments = pattern
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment === "$" || segment === "*") return "*";
      if (segment.startsWith("$")) return `:${segment.slice(1)}`;
      return segment;
    });
  return `/${normalizedSegments.join("/")}`.replace(/\/$/, "") || "/";
}

function joinRoutePattern(parentPattern, localPattern, index, pathless) {
  const parent = parentPattern ?? "/";
  if (index || pathless || localPattern === null || localPattern === "") return parent;
  const normalizedLocal = normalizeRoutePattern(localPattern);
  if (localPattern.startsWith("/")) return normalizedLocal;
  return normalizeRoutePattern(`${parent}/${normalizedLocal.slice(1)}`);
}

function routeParams(pattern) {
  if (pattern === null) return [];
  const params = [];
  for (const segment of pattern.split("/")) {
    if (segment === "*") {
      params.push({ name: "*", modifier: "splat" });
      continue;
    }
    const match = /^:([^?*]+)([?*]?)$/.exec(segment);
    if (!match) continue;
    params.push({
      name: match[1],
      modifier: match[2] === "?" ? "optional" : match[2] === "*" ? "splat" : "required",
    });
  }
  return params;
}

function routeCheckpoints(record) {
  const checks = new Set(["direct-navigation", "in-app-navigation", "reload", "back-forward"]);
  if (record.parentId !== null || record.path.kind === "pathless") checks.add("nested-layout-outlet");
  if (record.params.length > 0 || record.capabilities.includes("params")) checks.add("param-decoding");
  if (record.capabilities.includes("search")) checks.add("search-round-trip");
  if (record.capabilities.includes("loader")) checks.add("loader-pending-success-error");
  if (record.capabilities.includes("action") || record.capabilities.includes("mutation")) checks.add("mutation-revalidation");
  if (record.capabilities.includes("redirect")) checks.add("redirect-history");
  if (record.capabilities.includes("error")) checks.add("owned-error-boundary");
  if (record.capabilities.includes("pending")) checks.add("owned-pending-state");
  if (record.capabilities.includes("not-found")) checks.add("owned-not-found-state");
  if (record.capabilities.includes("blocker")) checks.add("navigation-blocking");
  if (record.capabilities.includes("scroll-restoration")) checks.add("scroll-restoration");
  return [...checks].sort();
}

function addRouteFinding(routing, finding) {
  addFinding(routing.findings, finding);
}

function addRouteRecord(routing, record) {
  const baseId = `${record.model}:${record.source.file}:${record.source.line}`;
  let id = baseId;
  let suffix = 2;
  while (routing.recordKeys.has(id)) {
    id = `${baseId}:${suffix}`;
    suffix += 1;
  }
  routing.recordKeys.add(id);
  const sourcePattern = record.sourcePattern ?? null;
  const normalizedPattern = record.normalizedPattern ?? normalizeRoutePattern(sourcePattern);
  const target = ROUTE_TARGETS[record.model] ?? {
    candidate: "explicit-route-contract",
    status: "review-required",
  };
  const entry = {
    id,
    model: record.model,
    source: record.source,
    module: record.module ?? null,
    parentId: record.parentId ?? null,
    index: record.index ?? false,
    path: {
      source: sourcePattern,
      normalized: normalizedPattern,
      kind: record.pathKind ?? (sourcePattern === null ? "dynamic-review" : "static"),
    },
    params: routeParams(normalizedPattern),
    capabilities: uniqueSorted(record.capabilities ?? []),
    execution: record.execution ?? "review-required",
    target: { candidate: target.candidate, status: target.status },
    _localPath: record.localPath ?? sourcePattern,
    _parentSymbol: record.parentSymbol ?? null,
    _symbol: record.symbol ?? null,
    _convention: record.convention ?? null,
    _parentConvention: record.parentConvention ?? null,
    _relatedModules: uniqueSorted(record.relatedModules ?? []),
    _searchKeys: uniqueSorted(record.searchKeys ?? []),
    _searchMode: record.searchMode ?? null,
    _redirects: uniqueSorted(record.redirects ?? []),
  };
  routing.records.push(entry);
  return entry;
}

function capabilitiesFromProperties(properties, body = "") {
  const capabilities = [];
  const propertyFeatures = new Map([
    ["loader", "loader"],
    ["action", "action"],
    ["clientLoader", "loader"],
    ["clientAction", "action"],
    ["errorElement", "error"],
    ["ErrorBoundary", "error"],
    ["errorComponent", "error"],
    ["pendingComponent", "pending"],
    ["hydrateFallbackElement", "pending"],
    ["notFoundComponent", "not-found"],
    ["validateSearch", "search"],
    ["loaderDeps", "search"],
    ["shouldRevalidate", "revalidation"],
    ["middleware", "middleware"],
    ["beforeLoad", "middleware"],
    ["children", "layout"],
  ]);
  for (const [property, feature] of propertyFeatures) {
    if (properties.has(property)) capabilities.push(feature);
  }
  if (/\bOutlet\b/.test(body)) capabilities.push("outlet");
  if (/\b(?:Link|NavLink|Navigate)\b/.test(body)) capabilities.push("link");
  if (/\bparams\b/.test(body)) capabilities.push("params");
  if (/\bredirect\s*\(/.test(body)) capabilities.push("redirect");
  if (/\bnotFound\s*\(/.test(body)) capabilities.push("not-found");
  return uniqueSorted(capabilities);
}

function addExecutionFindings(routing, record) {
  if (record.capabilities.includes("loader")) {
    addRouteFinding(routing, {
      code: "ROUTING_LOADER_TARGET_REQUIRED",
      severity: "review",
      category: "execution",
      file: record.source.file,
      line: record.source.line,
      reason: "A loader needs an explicit browser/server target, request context, cache policy, error contract, and direct-navigation test.",
    });
  }
  if (record.capabilities.includes("action")) {
    addRouteFinding(routing, {
      code: "ROUTING_ACTION_TARGET_REQUIRED",
      severity: "review",
      category: "execution",
      file: record.source.file,
      line: record.source.line,
      reason: "An action needs an explicit transport, validation, authentication, mutation, redirect, and revalidation target.",
    });
  }
}

function registerRouteModuleFeatures(file, text, routing) {
  const routeContext =
    /from\s+["'](?:react-router(?:-dom)?|@react-router\/|@remix-run\/|@tanstack\/react-router|@octanejs\/(?:remix-router|tanstack-router))/.test(text) ||
    /^(?:app\/)?routes\//.test(file) ||
    /(?:^|\/)routes\.[^/]+$/.test(file) ||
    /(?:^|\/)__root\.[^/]+$/.test(file);
  if (!routeContext) return;

  const lineFor = makeLineLocator(text);
  const locations = [];
  for (const { feature, expression } of ROUTE_FEATURE_APIS) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      locations.push({ feature, file, line: lineFor(match.index) });
    }
  }
  for (const feature of ["loader", "action", "clientLoader", "clientAction"]) {
    const expression = new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${feature}\\b`, "g");
    for (const match of text.matchAll(expression)) {
      locations.push({
        feature: feature.toLowerCase().includes("loader") ? "loader" : "action",
        file,
        line: lineFor(match.index),
      });
    }
  }
  if (locations.length === 0) return;
  const unique = new Map();
  for (const location of locations) unique.set(`${location.feature}\0${location.line}`, location);
  routing.moduleFeatures.set(file, [...unique.values()]);
  const searchKeys = searchKeysFromText(text);
  if (searchKeys.length > 0) routing.moduleSearchKeys.set(file, searchKeys);
  const redirects = redirectTargetsFromText(text);
  if (redirects.length > 0) routing.moduleRedirects.set(file, redirects);
}

function inspectDeclarativeRoutes(file, text, routing, model) {
  const lineFor = makeLineLocator(text);
  const stack = [];
  const expression = /<\/?Route(?=[\s/>])/g;
  for (const match of text.matchAll(expression)) {
    const closing = text[match.index + 1] === "/";
    if (closing) {
      stack.pop();
      continue;
    }
    let quote = null;
    let braces = 0;
    let end = match.index;
    for (; end < text.length; end += 1) {
      const character = text[end];
      const previous = text[end - 1];
      if (quote !== null) {
        if (character === quote && previous !== "\\") quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") quote = character;
      else if (character === "{") braces += 1;
      else if (character === "}") braces = Math.max(0, braces - 1);
      else if (character === ">" && braces === 0) break;
    }
    if (end >= text.length) continue;
    const tag = text.slice(match.index, end + 1);
    const line = lineFor(match.index);
    const sourcePattern = staticStringAttribute(tag, "path");
    const hasPath = hasAttribute(tag, "path");
    const index = hasStaticTrueAttribute(tag, "index");
    const pathless = !hasPath && !index;
    const parent = stack.at(-1) ?? null;
    const capabilities = [];
    if (hasAttribute(tag, "loader")) capabilities.push("loader");
    if (hasAttribute(tag, "action")) capabilities.push("action");
    if (hasAttribute(tag, "errorElement") || hasAttribute(tag, "ErrorBoundary")) capabilities.push("error");
    if (hasAttribute(tag, "hydrateFallbackElement")) capabilities.push("pending");
    if (hasAttribute(tag, "shouldRevalidate")) capabilities.push("revalidation");
    if (hasAttribute(tag, "children") || !/\/>\s*$/.test(tag)) capabilities.push("layout");
    if (sourcePattern === "*" || sourcePattern?.endsWith("/*")) capabilities.push("not-found");
    const record = addRouteRecord(routing, {
      model,
      source: { file, line },
      sourcePattern,
      normalizedPattern: hasPath && sourcePattern === null
        ? null
        : joinRoutePattern(parent?.path.normalized ?? "/", sourcePattern, index, pathless),
      pathKind: hasPath ? (sourcePattern === null ? "dynamic-review" : "static") : index ? "index" : "pathless",
      parentId: parent?.id ?? null,
      index,
      capabilities,
      relatedModules: uniqueSorted([
        importedModuleForSymbol(text, /\belement\s*=\s*\{\s*<([A-Z][A-Za-z0-9_$]*)\b/.exec(tag)?.[1]),
        importedModuleForSymbol(text, /\bComponent\s*=\s*\{\s*([A-Z][A-Za-z0-9_$]*)\s*\}/.exec(tag)?.[1]),
      ].filter(Boolean)),
      execution: model === "react-router-declarative" ? "client" : "review-required",
    });
    addExecutionFindings(routing, record);
    if (hasPath && sourcePattern === null) {
      addRouteFinding(routing, {
        code: "ROUTING_DYNAMIC_PATH_REVIEW",
        severity: "review",
        category: "matching",
        file,
        line,
        reason: "A non-literal route path cannot be normalized statically; resolve the value and preserve its matching semantics manually.",
      });
    }
    if (!/\/>\s*$/.test(tag)) stack.push(record);
  }
}

function resolveArrayArgument(text, argument) {
  if (argument.text.startsWith("[")) {
    const end = findDelimitedEnd(text, argument.start, "[", "]");
    return end === -1 ? null : { start: argument.start, end };
  }
  const identifier = /^([A-Za-z_$][\w$]*)$/.exec(argument.text)?.[1];
  if (!identifier) return null;
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assignment = new RegExp(`(?:const|let|var)\\s+${escaped}\\s*(?::[^=;]+)?=\\s*\\[`, "g").exec(text);
  if (!assignment) return null;
  const start = assignment.index + assignment[0].lastIndexOf("[");
  const end = findDelimitedEnd(text, start, "[", "]");
  return end === -1 ? null : { start, end };
}

function inspectRouteObjectArray(file, text, routing, model, array, parentRecord = null) {
  const lineFor = makeLineLocator(text);
  for (const rawRange of splitTopLevelRanges(text, array.start + 1, array.end)) {
    const range = trimRange(text, rawRange);
    if (!range.text.startsWith("{")) continue;
    const objectEnd = findDelimitedEnd(text, range.start, "{", "}");
    if (objectEnd === -1 || objectEnd > range.end) continue;
    const properties = parseObjectProperties(text, range.start, objectEnd);
    const index = /^true\b/.test(properties.get("index")?.text ?? "");
    const pathProperty = properties.get("path") ?? null;
    const sourcePattern = pathProperty ? parseStaticString(pathProperty.text) : null;
    const routeLike = pathProperty !== null || index || properties.has("children") || properties.has("Component") || properties.has("element");
    if (!routeLike) continue;
    const pathless = pathProperty === null && !index;
    const localBody = [...properties.entries()]
      .filter(([name]) => name !== "children")
      .map(([, value]) => value.text)
      .join("\n");
    const capabilities = capabilitiesFromProperties(properties, localBody);
    if (sourcePattern === "*" || sourcePattern?.endsWith("/*")) capabilities.push("not-found");
    const line = lineFor(range.start);
    const record = addRouteRecord(routing, {
      model,
      source: { file, line },
      sourcePattern,
      normalizedPattern: pathProperty && sourcePattern === null
        ? null
        : joinRoutePattern(parentRecord?.path.normalized ?? "/", sourcePattern, index, pathless),
      pathKind: pathProperty ? (sourcePattern === null ? "dynamic-review" : "static") : index ? "index" : "pathless",
      parentId: parentRecord?.id ?? null,
      index,
      capabilities,
      relatedModules: relatedModulesFromProperties(text, properties),
      searchKeys: searchKeysFromProperties(properties),
      searchMode: properties.has("validateSearch") ? "validated" : null,
      redirects: redirectTargetsFromText(localBody),
      execution: capabilities.some((feature) => feature === "loader" || feature === "action") ? "review-required" : "client",
    });
    addExecutionFindings(routing, record);
    if (pathProperty && sourcePattern === null) {
      addRouteFinding(routing, {
        code: "ROUTING_DYNAMIC_PATH_REVIEW",
        severity: "review",
        category: "matching",
        file,
        line,
        reason: "A non-literal route-object path cannot be normalized statically; resolve the value and preserve its matching semantics manually.",
      });
    }
    const children = properties.get("children");
    if (children?.text.startsWith("[")) {
      const childEnd = findDelimitedEnd(text, children.start, "[", "]");
      if (childEnd !== -1) inspectRouteObjectArray(file, text, routing, model, { start: children.start, end: childEnd }, record);
    }
  }
}

function inspectDataRouteCalls(file, text, routing) {
  const calls = [
    { name: "createBrowserRouter", model: "react-router-data" },
    { name: "createHashRouter", model: "react-router-data" },
    { name: "createMemoryRouter", model: "react-router-data" },
    { name: "useRoutes", model: "react-router-declarative" },
  ];
  for (const call of calls) {
    for (const site of findCallSites(text, call.name)) {
      const parsed = callArguments(text, site.openParen);
      const firstArgument = parsed?.arguments[0];
      if (!firstArgument) continue;
      const array = resolveArrayArgument(text, firstArgument);
      const arrayKey = array ? `${call.model}\0${file}\0${array.start}` : null;
      if (array && !routing.parsedRouteArrays.has(arrayKey)) {
        routing.parsedRouteArrays.add(arrayKey);
        inspectRouteObjectArray(file, text, routing, call.model, array);
      }
      else {
        addRouteFinding(routing, {
          code: "ROUTING_DYNAMIC_TREE_REVIEW",
          severity: "review",
          category: "matching",
          file,
          line: makeLineLocator(text)(site.offset),
          reason: "The router receives a route tree that this bounded static audit cannot follow; export or document a normalized route manifest before porting.",
        });
      }
    }
  }
}

function inspectFrameworkRoutes(file, text, routing) {
  if (!/(?:^|\/)routes\.[^/]+$/.test(file) && !/from\s+["']@react-router\/dev\/routes["']/.test(text)) return;
  const lineFor = makeLineLocator(text);
  const calls = [];
  for (const name of ["index", "layout", "prefix", "route"]) {
    for (const site of findCallSites(text, name)) {
      const parsed = callArguments(text, site.openParen);
      if (!parsed) continue;
      calls.push({ name, start: site.offset, end: parsed.closeParen, arguments: parsed.arguments, record: null });
    }
  }
  calls.sort((left, right) => left.start - right.start || right.end - left.end);
  if (calls.length > 0) {
    addRouteFinding(routing, {
      code: "ROUTING_FRAMEWORK_MODE_REWRITE",
      severity: "blocker",
      category: "target",
      file,
      line: lineFor(calls[0].start),
      reason: "React Router Framework Mode has no direct Octane runtime target; choose a data-router rewrite or a verified full-app router before converting route modules.",
    });
  }

  for (const call of calls) {
    if (call.name === "prefix") continue;
    const ancestors = calls.filter((candidate) => candidate.start < call.start && candidate.end > call.end);
    const parentCall = [...ancestors].reverse().find((candidate) => candidate.name === "route" || candidate.name === "layout") ?? null;
    const pathSegments = [];
    for (const ancestor of [...ancestors, call].sort((left, right) => left.start - right.start)) {
      if (ancestor.name !== "prefix" && ancestor.name !== "route") continue;
      const segment = parseStaticString(ancestor.arguments[0]?.text ?? "");
      if (segment !== null) pathSegments.push(segment);
    }
    const index = call.name === "index";
    const pathless = call.name === "layout";
    const sourcePattern = call.name === "route" ? parseStaticString(call.arguments[0]?.text ?? "") : null;
    const moduleArgument = call.name === "route" ? call.arguments[1] : call.arguments[0];
    const module = moduleArgument ? parseStaticString(moduleArgument.text) : null;
    const normalizedPattern = call.name === "route" && sourcePattern === null
      ? null
      : index || pathless
      ? parentCall?.record?.path.normalized ?? normalizeRoutePattern(pathSegments.join("/"))
      : normalizeRoutePattern(pathSegments.join("/"));
    call.record = addRouteRecord(routing, {
      model: "react-router-framework",
      source: { file, line: lineFor(call.start) },
      sourcePattern,
      normalizedPattern,
      pathKind: index ? "index" : pathless ? "pathless" : sourcePattern === null ? "dynamic-review" : "static",
      parentId: parentCall?.record?.id ?? null,
      index,
      module,
      capabilities: pathless ? ["layout"] : [],
      execution: "server-or-client-review",
    });
  }
}

function inspectTanStackCodeRoutes(file, text, routing, model = "tanstack-code") {
  const lineFor = makeLineLocator(text);
  const names = ["createRootRoute", "createRootRouteWithContext", "createRoute"];
  for (const name of names) {
    for (const site of findCallSites(text, name)) {
      const parsed = callArguments(text, site.openParen);
      const first = parsed?.arguments[0];
      let properties = new Map();
      let body = "";
      if (first?.text.startsWith("{")) {
        const objectEnd = findDelimitedEnd(text, first.start, "{", "}");
        if (objectEnd !== -1) {
          properties = parseObjectProperties(text, first.start, objectEnd);
          body = text.slice(first.start, objectEnd + 1);
        }
      }
      const root = name !== "createRoute";
      const pathProperty = properties.get("path") ?? properties.get("id") ?? null;
      const sourcePattern = root ? "/" : pathProperty ? parseStaticString(pathProperty.text) : null;
      const parentText = properties.get("getParentRoute")?.text ?? "";
      const parentSymbol = /=>\s*([A-Za-z_$][\w$]*)/.exec(parentText)?.[1] ?? null;
      const capabilities = capabilitiesFromProperties(properties, body);
      const record = addRouteRecord(routing, {
        model,
        source: { file, line: lineFor(site.offset) },
        sourcePattern,
        normalizedPattern: root ? "/" : normalizeRoutePattern(sourcePattern),
        pathKind: root ? "root" : sourcePattern === null ? "dynamic-review" : "static",
        capabilities: root ? uniqueSorted([...capabilities, "layout"]) : capabilities,
        execution: capabilities.some((feature) => feature === "loader" || feature === "action" || feature === "middleware")
          ? "client-or-server-review"
          : "client",
        symbol: assignedIdentifier(text, site.offset),
        parentSymbol,
        localPath: sourcePattern,
        relatedModules: relatedModulesFromProperties(text, properties),
        searchKeys: searchKeysFromProperties(properties),
        searchMode: properties.has("validateSearch") ? "validated" : null,
        redirects: redirectTargetsFromText(body),
      });
      addExecutionFindings(routing, record);
      if (!root && pathProperty && sourcePattern === null) {
        addRouteFinding(routing, {
          code: "ROUTING_DYNAMIC_PATH_REVIEW",
          severity: "review",
          category: "matching",
          file,
          line: record.source.line,
          reason: "A non-literal TanStack route path cannot be normalized statically; preserve its typed matching contract manually.",
        });
      }
    }
  }
}

function inspectTanStackFileRoutes(file, text, routing) {
  const lineFor = makeLineLocator(text);
  const isRootFile = /(?:^|\/)routes\/__root\.[^/]+$/.test(file) || /(?:^|\/)__root\.[^/]+$/.test(file);
  if (isRootFile) inspectTanStackCodeRoutes(file, text, routing, "tanstack-file");

  for (const name of ["createFileRoute", "createLazyFileRoute"]) {
    for (const site of findCallSites(text, name)) {
      const parsed = callArguments(text, site.openParen);
      const sourcePattern = parseStaticString(parsed?.arguments[0]?.text ?? "");
      let properties = new Map();
      let body = "";
      if (parsed) {
        let cursor = parsed.closeParen + 1;
        while (/\s/.test(text[cursor] ?? "")) cursor += 1;
        if (text[cursor] === "(") {
          const options = callArguments(text, cursor)?.arguments[0];
          if (options?.text.startsWith("{")) {
            const objectEnd = findDelimitedEnd(text, options.start, "{", "}");
            if (objectEnd !== -1) {
              properties = parseObjectProperties(text, options.start, objectEnd);
              body = text.slice(options.start, objectEnd + 1);
            }
          }
        }
      }
      const capabilities = capabilitiesFromProperties(properties, body);
      if (name === "createLazyFileRoute") capabilities.push("lazy");
      const record = addRouteRecord(routing, {
        model: "tanstack-file",
        source: { file, line: lineFor(site.offset) },
        sourcePattern,
        normalizedPattern: normalizeRoutePattern(sourcePattern),
        pathKind: sourcePattern === null ? "dynamic-review" : "file-generated",
        capabilities,
        execution: capabilities.some((feature) => feature === "loader" || feature === "middleware")
          ? "client-or-server-review"
          : "client",
        localPath: sourcePattern,
        relatedModules: relatedModulesFromProperties(text, properties),
        searchKeys: searchKeysFromProperties(properties),
        searchMode: properties.has("validateSearch") ? "validated" : null,
        redirects: redirectTargetsFromText(body),
      });
      addExecutionFindings(routing, record);
      addRouteFinding(routing, {
        code: "ROUTING_TANSTACK_GENERATOR_REQUIRED",
        severity: "review",
        category: "generation",
        file,
        line: record.source.line,
        reason: "Preserve file-route IDs and generated typing with the TSRX-aware generator, or convert the tree explicitly to code-based routes.",
      });
    }
  }
}

function inferRemixRoute(file) {
  const extensionless = file.replace(/\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)$/u, "");
  if (/(?:^|\/)app\/root$/u.test(extensionless) || extensionless === "root") {
    return { convention: "root", parentConvention: null, sourcePattern: "/", normalizedPattern: "/", index: false, pathKind: "root" };
  }
  const marker = extensionless.indexOf("routes/");
  if (marker === -1) return null;
  let convention = extensionless.slice(marker + "routes/".length);
  if (convention.endsWith("/route")) convention = convention.slice(0, -"/route".length);
  convention = convention.replaceAll("/", ".");
  const parts = convention.split(".").filter(Boolean);
  const index = parts.at(-1) === "_index";
  const urlParts = [];
  let nestingDisabled = false;
  for (const part of parts) {
    if (part === "_index") continue;
    if (part.startsWith("_") && !part.endsWith("_")) continue;
    let segment = part;
    if (segment.endsWith("_")) {
      nestingDisabled = true;
      segment = segment.slice(0, -1);
    }
    const optionalDynamic = /^\(\$([^)]+)\)$/.exec(segment);
    if (optionalDynamic) urlParts.push(`:${optionalDynamic[1]}?`);
    else if (segment === "$") urlParts.push("*");
    else if (segment.startsWith("$")) urlParts.push(`:${segment.slice(1)}`);
    else if (/^\(.+\)$/.test(segment)) urlParts.push(segment.slice(1, -1));
    else if (segment) urlParts.push(segment);
  }
  const parentParts = nestingDisabled ? [] : parts.slice(0, -1);
  return {
    convention,
    parentConvention: parentParts.join(".") || "root",
    sourcePattern: `/${urlParts.join("/")}` || "/",
    normalizedPattern: normalizeRoutePattern(urlParts.join("/")),
    index,
    pathKind: "filesystem-inferred",
  };
}

function inspectRemixRoute(file, text, routing) {
  const inferred = inferRemixRoute(file);
  if (!inferred) return;
  const lineFor = makeLineLocator(text);
  const firstExport = /\bexport\b/.exec(text);
  const locations = routing.moduleFeatures.get(file) ?? [];
  const capabilities = uniqueSorted(locations.map((location) => location.feature));
  const line = firstExport ? lineFor(firstExport.index) : 1;
  const record = addRouteRecord(routing, {
    model: "remix",
    source: { file, line },
    sourcePattern: inferred.sourcePattern,
    normalizedPattern: inferred.normalizedPattern,
    pathKind: inferred.pathKind,
    index: inferred.index,
    capabilities,
    execution: capabilities.some((feature) => feature === "loader" || feature === "action") ? "server-and-client-review" : "client",
    convention: inferred.convention,
    parentConvention: inferred.parentConvention,
  });
  addExecutionFindings(routing, record);
  addRouteFinding(routing, {
    code: "ROUTING_REMIX_MODULE_REWRITE",
    severity: "blocker",
    category: "target",
    file,
    line,
    reason: "Remix route-module exports need a selected data-router or full-app target; do not replace framework imports without rebuilding request and document ownership.",
  });
}

function inspectRoutes(file, text, routeSignals, routing) {
  const extensionPattern = "(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)";
  const appSpecial = new RegExp(`^(?:src/)?app/(?:.+/)?(?:page|layout|template|loading|error|not-found|default|route)\\.${extensionPattern}$`);
  const pagesRoute = new RegExp(`^(?:src/)?pages/(?:.+\\.)?${extensionPattern}$`);
  const importsReactRouter = /from\s+["'](?:react-router(?:-dom)?|@octanejs\/remix-router(?:\/dom)?)["']/.test(text);

  if (appSpecial.test(file)) addRouteSignal(routeSignals, "next-app", file, "app special file");
  if (pagesRoute.test(file)) addRouteSignal(routeSignals, "next-pages", file, "pages route file");

  if (importsReactRouter && (/\b(?:BrowserRouter|HashRouter|MemoryRouter|Routes|useRoutes)\b/.test(text) || /<Route(?=[\s/>])/.test(text))) {
    addRouteSignal(routeSignals, "react-router-declarative", file, "declarative router API");
    inspectDeclarativeRoutes(file, text, routing, "react-router-declarative");
  }
  if (importsReactRouter && /\b(?:createBrowserRouter|createHashRouter|createMemoryRouter|RouterProvider)\b/.test(text)) {
    addRouteSignal(routeSignals, "react-router-data", file, "data router API");
  }
  if (
    /(?:^|\/)react-router\.config\.[^/]+$/.test(file) ||
    /from\s+["']@react-router\/dev\/routes["']/.test(text) ||
    /\b(?:index|layout|prefix|route)\s*\(/.test(text) && file.includes("routes")
  ) {
    addRouteSignal(routeSignals, "react-router-framework", file, "framework route configuration");
    inspectFrameworkRoutes(file, text, routing);
  }
  const tanStackRootFile = /(?:^|\/)routes\/__root\.[^/]+$/.test(file) && /\b(?:createRootRoute|createRootRouteWithContext)\b/.test(text);
  if (/\b(?:createFileRoute|createLazyFileRoute)\b/.test(text) || /(?:^|\/)routeTree\.gen\.[^/]+$/.test(file) || tanStackRootFile) {
    addRouteSignal(routeSignals, "tanstack-file", file, "file route API or generated tree");
    inspectTanStackFileRoutes(file, text, routing);
  }
  if (
    /\b(?:createRootRoute|createRootRouteWithContext|createRoute)\b/.test(text) &&
    /(?:@tanstack\/react-router|@octanejs\/tanstack-router)/.test(text) &&
    !/\bcreateFileRoute\b/.test(text) &&
    !/(?:^|\/)routes\/__root\.[^/]+$/.test(file)
  ) {
    addRouteSignal(routeSignals, "tanstack-code", file, "code route API");
    inspectTanStackCodeRoutes(file, text, routing);
  }
  if ((/^(?:app\/)?routes\//.test(file) || /(?:^|\/)app\/root\.[^/]+$/.test(file)) && /@remix-run\//.test(text)) {
    addRouteSignal(routeSignals, "remix", file, "Remix route module");
    inspectRemixRoute(file, text, routing);
  }
  if (/\b(?:history\.(?:pushState|replaceState)|popstate|location\.pathname)\b/.test(text)) {
    addRouteSignal(routeSignals, "custom-history", file, "browser history API");
  }

  inspectDataRouteCalls(file, text, routing);
}

function resolveRouteModuleFile(configFile, moduleSpecifier, sourceFiles) {
  if (!moduleSpecifier?.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(configFile), moduleSpecifier));
  const candidates = [base];
  if (!path.posix.extname(base)) {
    for (const extension of [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"]) {
      candidates.push(`${base}${extension}`);
      candidates.push(`${base}/route${extension}`);
    }
  }
  return candidates.find((candidate) => sourceFiles.has(candidate)) ?? null;
}

function mergeRecordModuleFeatures(record, routing) {
  const files = record.model === "remix" || record.model === "tanstack-file" ? [record.source.file] : [];
  const resolvedModule = resolveRouteModuleFile(record.source.file, record.module, routing.sourceFiles);
  if (resolvedModule) files.push(resolvedModule);
  for (const moduleSpecifier of record._relatedModules) {
    const related = resolveRouteModuleFile(record.source.file, moduleSpecifier, routing.sourceFiles);
    if (related) files.push(related);
  }
  const locations = files.flatMap((file) => routing.moduleFeatures.get(file) ?? []);
  record.capabilities = uniqueSorted([...record.capabilities, ...locations.map((location) => location.feature)]);
  record._searchKeys = uniqueSorted([
    ...record._searchKeys,
    ...files.flatMap((file) => routing.moduleSearchKeys.get(file) ?? []),
  ]);
  record._redirects = uniqueSorted([
    ...record._redirects,
    ...files.flatMap((file) => routing.moduleRedirects.get(file) ?? []),
  ]);
  if (record._searchKeys.length > 0 && record._searchMode === null) record._searchMode = "consumed-unvalidated";
  for (const location of locations) {
    if (location.feature === "loader") {
      addRouteFinding(routing, {
        code: "ROUTING_LOADER_TARGET_REQUIRED",
        severity: "review",
        category: "execution",
        file: location.file,
        line: location.line,
        reason: "A loader needs an explicit browser/server target, request context, cache policy, error contract, and direct-navigation test.",
      });
    }
    if (location.feature === "action") {
      addRouteFinding(routing, {
        code: "ROUTING_ACTION_TARGET_REQUIRED",
        severity: "review",
        category: "execution",
        file: location.file,
        line: location.line,
        reason: "An action needs an explicit transport, validation, authentication, mutation, redirect, and revalidation target.",
      });
    }
  }
}

function pathIsParent(candidate, child) {
  if (candidate === null || child === null || candidate === child) return false;
  if (candidate === "/") return child.startsWith("/");
  return child.startsWith(`${candidate}/`);
}

function finalizeRoutingCollector(routing, models) {
  for (const record of routing.records) mergeRecordModuleFeatures(record, routing);

  const symbolRecords = new Map();
  for (const record of routing.records) {
    if (record._symbol) symbolRecords.set(`${record.source.file}\0${record._symbol}`, record);
  }
  for (const record of routing.records) {
    if (!record._parentSymbol) continue;
    const sameFile = symbolRecords.get(`${record.source.file}\0${record._parentSymbol}`);
    const candidates = routing.records.filter((candidate) => candidate._symbol === record._parentSymbol);
    const parent = sameFile ?? (candidates.length === 1 ? candidates[0] : null);
    if (parent) record.parentId = parent.id;
  }

  const recordById = new Map(routing.records.map((record) => [record.id, record]));
  const resolving = new Set();
  function resolveCodePath(record) {
    if (record.model !== "tanstack-code" || record.path.kind === "root") return record.path.normalized;
    if (record._localPath === null) {
      record.path.normalized = null;
      return null;
    }
    if (resolving.has(record.id)) return record.path.normalized;
    resolving.add(record.id);
    const parent = record.parentId ? recordById.get(record.parentId) : null;
    const parentPattern = parent ? resolveCodePath(parent) : "/";
    record.path.normalized = joinRoutePattern(parentPattern, record._localPath, false, record._localPath === null);
    resolving.delete(record.id);
    return record.path.normalized;
  }
  for (const record of routing.records) resolveCodePath(record);

  const tanStackFileRecords = routing.records.filter((record) => record.model === "tanstack-file");
  for (const record of tanStackFileRecords) {
    if (record.path.kind === "root" || record.parentId !== null) continue;
    const candidates = tanStackFileRecords
      .filter((candidate) => candidate.id !== record.id && (
        pathIsParent(candidate.path.normalized, record.path.normalized) ||
        (candidate.path.kind === "root" && record.path.normalized === "/")
      ))
      .sort((left, right) => (right.path.normalized?.length ?? 0) - (left.path.normalized?.length ?? 0));
    if (candidates[0]) record.parentId = candidates[0].id;
  }

  const remixByConvention = new Map(
    routing.records
      .filter((record) => record.model === "remix" && record._convention)
      .map((record) => [record._convention, record]),
  );
  for (const record of routing.records.filter((candidate) => candidate.model === "remix")) {
    if (!record._parentConvention) continue;
    let convention = record._parentConvention;
    let parent = remixByConvention.get(convention) ?? null;
    while (!parent && convention.includes(".")) {
      convention = convention.slice(0, convention.lastIndexOf("."));
      parent = remixByConvention.get(convention) ?? null;
    }
    parent ??= remixByConvention.get("root") ?? null;
    if (parent && parent.id !== record.id) record.parentId = parent.id;
  }

  for (const record of routing.records) {
    record.params = routeParams(record.path.normalized);
    record.search = {
      mode: record.capabilities.includes("search") ? record._searchMode ?? "review-required" : "none-detected",
      keys: record._searchKeys,
    };
    record.redirects = record._redirects;
    record.checkpoints = routeCheckpoints(record);
  }

  const modelIds = models.map((model) => model.id);
  const targets = modelIds.map((id) => ({ model: id, ...(ROUTE_TARGETS[id] ?? {
    protocol: id,
    mode: "unknown",
    candidate: "explicit-route-contract",
    status: "review-required",
    reason: "Select and verify a target router against the normalized route contract.",
  }) }));
  const unresolvedModels = modelIds.filter((id) => !routing.records.some((record) => record.model === id));
  for (const model of unresolvedModels) {
    const source = models.find((entry) => entry.id === model)?.files[0];
    if (!source) continue;
    addRouteFinding(routing, {
      code: "ROUTING_MANIFEST_INCOMPLETE",
      severity: "review",
      category: "inventory",
      file: source,
      line: 1,
      reason: "The routing protocol was detected, but no static route entries were safe to infer; document this model manually before editing routes.",
    });
  }

  const featureLocations = new Map();
  const routeFiles = new Set(routing.records.flatMap((record) => {
    const files = [record.source.file];
    const resolved = resolveRouteModuleFile(record.source.file, record.module, routing.sourceFiles);
    if (resolved) files.push(resolved);
    for (const moduleSpecifier of record._relatedModules) {
      const related = resolveRouteModuleFile(record.source.file, moduleSpecifier, routing.sourceFiles);
      if (related) files.push(related);
    }
    return files;
  }));
  for (const file of routeFiles) {
    for (const location of routing.moduleFeatures.get(file) ?? []) {
      featureLocations.set(`${location.feature}\0${location.file}\0${location.line}`, location);
    }
  }
  const features = {};
  for (const location of [...featureLocations.values()].sort(
    (left, right) => left.feature.localeCompare(right.feature) || left.file.localeCompare(right.file) || left.line - right.line,
  )) {
    const summary = features[location.feature] ?? { count: 0, locations: [] };
    summary.count += 1;
    if (summary.locations.length < MAX_REPORTED_PATHS) summary.locations.push({ file: location.file, line: location.line });
    features[location.feature] = summary;
  }

  const routes = routing.records
    .sort((left, right) => left.source.file.localeCompare(right.source.file) || left.source.line - right.source.line || left.id.localeCompare(right.id))
    .map((record) => {
      const {
        _localPath,
        _parentSymbol,
        _symbol,
        _convention,
        _parentConvention,
        _relatedModules,
        _searchKeys,
        _searchMode,
        _redirects,
        ...publicRecord
      } = record;
      return publicRecord;
    });
  const findingItems = [...routing.findings.items].sort(
    (left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.code.localeCompare(right.code),
  );
  const dynamicRoutes = routes.filter((route) => route.path.normalized === null || route.path.kind === "dynamic-review").length;
  const capabilityCounts = {};
  for (const route of routes) {
    for (const capability of route.capabilities) increment(capabilityCounts, capability);
  }

  return {
    targets,
    manifest: {
      version: ROUTE_MANIFEST_VERSION,
      status: modelIds.length === 0
        ? "none"
        : unresolvedModels.length > 0 || dynamicRoutes > 0
          ? "partial-review-required"
          : "inferred-review-required",
      summary: {
        routes: routes.length,
        dynamicRoutes,
        unresolvedModels,
        capabilities: makeCountSummary(capabilityCounts),
      },
      applicationCheckpoints: uniqueSorted([
        "direct-navigation",
        "in-app-navigation",
        "reload",
        "back-forward",
        "not-found",
        ...routes.flatMap((route) => route.checkpoints),
      ]),
      routes,
    },
    features,
    findings: {
      count: routing.findings.count,
      items: findingItems,
      truncated: routing.findings.count > findingItems.length,
    },
  };
}

function inspectStyling(file, text, styling) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".css") {
    styling.cssFiles.push(file);
    if (/\.module\.css$/i.test(file)) styling.cssModuleFiles.push(file);
  }
  if (extension === ".scss" || extension === ".sass") styling.sassFiles.push(file);
  if (extension === ".less") styling.lessFiles.push(file);
  if (/(?:^|\/)tailwind\.config\.[^/]+$/.test(file) || /@import\s+["']tailwindcss["']|@tailwind\s+(?:base|components|utilities)/.test(text)) {
    styling.tailwindSignals.push(file);
  }
  if (/\bstyle\s*=\s*\{/.test(text)) styling.inlineStyleFiles.push(file);
  if (/\b(?:styled|css)\s*(?:\.|\(|`)|<style\s+jsx\b/.test(text)) styling.cssInJsFiles.push(file);
}

function inspectReact(file, text, react) {
  if (/\.(?:jsx|tsx)$/i.test(file)) react.componentFiles.push(file);
  if (/^\s*["']use client["'];?/m.test(text)) react.clientDirectiveFiles.push(file);
  if (/^\s*["']use server["'];?/m.test(text)) react.serverDirectiveFiles.push(file);
  if (/\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+(?:React\.)?(?:PureComponent|Component)\b/.test(text)) {
    react.classComponentFiles.push(file);
  }
  if (/\b(?:function\s+use[A-Z][\w$]*|(?:const|let|var)\s+use[A-Z][\w$]*\s*=)/.test(text)) {
    react.customHookFiles.push(file);
  }

  for (const hook of HOOK_NAMES) {
    const count = findCallOffsets(text, hook).length;
    if (count > 0) increment(react.hooks, hook, count);
  }
  for (const api of REACT_API_NAMES) {
    const count = findCallOffsets(text, api).length;
    if (count > 0) increment(react.apis, api, count);
  }

  for (const match of text.matchAll(/from\s+["']next\/([^"']+)["']/g)) {
    react.nextImports.push(`next/${match[1]}`);
  }
}

function inspectInteractive(file, text, react, interactive) {
  const lineFor = makeLineLocator(text);
  const tags = scanOpeningTags(text);

  for (const tag of tags) {
    const lowerName = tag.name.toLowerCase();
    const isHost = tag.name === lowerName;
    const line = lineFor(tag.offset);

    if (isHost && (lowerName === "input" || lowerName === "textarea" || lowerName === "select")) {
      const hasType = hasAttribute(tag.source, "type");
      const staticType = lowerName === "input" ? staticStringAttribute(tag.source, "type") : null;
      const inputType = staticType?.toLowerCase() ?? "";
      const dynamicInputType = lowerName === "input" && hasType && staticType === null;
      const isTextEntry = lowerName === "textarea" || (lowerName === "input" && !dynamicInputType && TEXT_INPUT_TYPES.has(inputType));
      const isCheckable = lowerName === "input" && (inputType === "checkbox" || inputType === "radio");
      const isDisabledOrReadOnly = hasStaticTrueAttribute(tag.source, "disabled") || hasStaticTrueAttribute(tag.source, "readOnly");

      if (dynamicInputType) {
        addFinding(interactive.findings, {
          code: "INTERACTIVE_DYNAMIC_INPUT_TYPE_REVIEW",
          severity: "review",
          category: "events",
          file,
          line,
          reason: "A dynamic input type prevents static text/checkable event classification; verify the final props for every type branch.",
        });
      }

      if (isTextEntry) {
        addInteractiveSignal(interactive, file, "text");
        addLocation(interactive.locations.text, file, line, lowerName === "textarea" ? "textarea" : inputType || "text");
        const suppressesWarning = hasAttribute(tag.source, "suppressNativeChangeWarning");
        if (
          hasAttribute(tag.source, "onChange") &&
          !hasAttribute(tag.source, "onInput") &&
          !suppressesWarning &&
          !isDisabledOrReadOnly
        ) {
          react.textInputOnChangeFiles.push(file);
          addFinding(interactive.findings, {
            code: "INTERACTIVE_NATIVE_TEXT_ONCHANGE",
            severity: "warning",
            category: "events",
            file,
            line,
            reason: "React text onChange is per-edit synthetic behavior; Octane uses native onInput for each edit.",
          });
        }
        if (
          hasAttribute(tag.source, "onChangeCapture") &&
          !hasAttribute(tag.source, "onInputCapture") &&
          !suppressesWarning &&
          !isDisabledOrReadOnly
        ) {
          react.textInputOnChangeFiles.push(file);
          addFinding(interactive.findings, {
            code: "INTERACTIVE_NATIVE_TEXT_ONCHANGE_CAPTURE",
            severity: "warning",
            category: "events",
            file,
            line,
            reason: "Preserve the capture phase while moving per-edit text handling from onChangeCapture to onInputCapture.",
          });
        }
      }

      if (isCheckable) {
        addInteractiveSignal(interactive, file, "checkable");
        addLocation(interactive.locations.checkable, file, line, inputType);
      }
      if (lowerName === "select") {
        addInteractiveSignal(interactive, file, "select");
        addLocation(interactive.locations.select, file, line, "select");
      }
      if (hasAttribute(tag.source, "defaultValue") || hasAttribute(tag.source, "defaultChecked")) {
        addInteractiveSignal(interactive, file, "uncontrolled");
        addLocation(interactive.locations.uncontrolled, file, line, lowerName);
      }
    }

    if (isHost && lowerName === "form") {
      addInteractiveSignal(interactive, file, "form");
      addLocation(interactive.locations.forms, file, line, "form");
    }

    if (isHost && (hasAttribute(tag.source, "onBeforeInput") || hasAttribute(tag.source, "onSelect"))) {
      addFinding(interactive.findings, {
        code: "INTERACTIVE_SYNTHETIC_EVENT_REVIEW",
        severity: "warning",
        category: "events",
        file,
        line,
        reason: "Octane delivers native browser events and does not provide React's synthetic onBeforeInput or onSelect polyfills.",
      });
    }

    if (hasAttribute(tag.source, "ref")) addInteractiveSignal(interactive, file, "ref");
    if (hasAttribute(tag.source, "ref") && /\bref\s*=\s*["'][^"']+["']/.test(tag.source)) {
      addInteractiveSignal(interactive, file, "ref");
      addFinding(interactive.findings, {
        code: "INTERACTIVE_STRING_REF_REWRITE",
        severity: "blocker",
        category: "refs",
        file,
        line,
        reason: "String refs are legacy React behavior; replace the ownership contract with an object or callback ref.",
      });
    }

    if (tag.name === "Suspense" || tag.name === "ErrorBoundary") addInteractiveSignal(interactive, file, "boundary");
    if (tag.name === "StrictMode") {
      addFinding(interactive.findings, {
        code: "INTERACTIVE_STRICT_MODE_REVIEW",
        severity: "warning",
        category: "lifecycle",
        file,
        line,
        reason: "Octane has no StrictMode double-invocation contract; remove the wrapper only after cleanup and idempotence tests pass.",
      });
    }
    if (tag.name === "Profiler" || tag.name === "SuspenseList") {
      addFinding(interactive.findings, {
        code: "INTERACTIVE_UNSUPPORTED_BOUNDARY_API",
        severity: "blocker",
        category: "boundaries",
        file,
        line,
        reason: `${tag.name} has no Octane equivalent; preserve its user-visible or measurement contract with a reviewed replacement.`,
      });
    }
  }

  const hookSignals = new Map([
    ["useState", "state"],
    ["useReducer", "state"],
    ["useActionState", "form"],
    ["useOptimistic", "form"],
    ["useFormStatus", "form"],
    ["useEffect", "effect"],
    ["useEffectEvent", "effect"],
    ["useLayoutEffect", "effect"],
    ["useInsertionEffect", "effect"],
    ["useSyncExternalStore", "effect"],
    ["useRef", "ref"],
    ["useImperativeHandle", "ref"],
    ["useContext", "context"],
    ["useTransition", "transition"],
    ["useDeferredValue", "transition"],
    ["useMemo", "memo"],
    ["useCallback", "memo"],
  ]);
  for (const [hook, signal] of hookSignals) {
    if (findCallOffsets(text, hook).length > 0) addInteractiveSignal(interactive, file, signal);
  }
  if (findCallOffsets(text, "createContext").length > 0) addInteractiveSignal(interactive, file, "context");
  if (/\b(?:Suspense|ErrorBoundary)\b/.test(text) || findCallOffsets(text, "lazy").length > 0) addInteractiveSignal(interactive, file, "boundary");
  if (findCallOffsets(text, "memo").length > 0) addInteractiveSignal(interactive, file, "memo");
  if (["startTransition", "useTransition", "useDeferredValue"].some((name) => findCallOffsets(text, name).length > 0)) {
    addInteractiveSignal(interactive, file, "transition");
  }
  if (["hydrateRoot", "hydrate"].some((name) => findCallOffsets(text, name).length > 0)) {
    addInteractiveSignal(interactive, file, "hydration");
  }

  for (const offset of findCallOffsets(text, "createPortal")) {
    addInteractiveSignal(interactive, file, "portal");
    addFinding(interactive.findings, {
      code: "INTERACTIVE_PORTAL_OWNERSHIP_REVIEW",
      severity: "review",
      category: "portals",
      file,
      line: lineFor(offset),
      reason: "Verify target lifetime, focus, cleanup, and native event order while preserving logical bubbling through the portal.",
    });
  }

  const unsupportedCalls = [
    {
      name: "forwardRef",
      code: "INTERACTIVE_FORWARD_REF_REWRITE",
      reason: "Octane accepts ref as an ordinary component prop and does not provide forwardRef.",
    },
    {
      name: "createRef",
      code: "INTERACTIVE_CREATE_REF_REWRITE",
      reason: "Octane does not provide createRef; use a stable useRef in a function component or accept a ref prop.",
    },
  ];
  for (const api of unsupportedCalls) {
    for (const offset of findCallOffsets(text, api.name)) {
      addInteractiveSignal(interactive, file, "ref");
      addFinding(interactive.findings, {
        code: api.code,
        severity: "blocker",
        category: "refs",
        file,
        line: lineFor(offset),
        reason: api.reason,
      });
    }
  }

  const dependencySensitiveHooks = [
    { name: "useEffect", minimumArguments: 2, signal: "effect" },
    { name: "useLayoutEffect", minimumArguments: 2, signal: "effect" },
    { name: "useInsertionEffect", minimumArguments: 2, signal: "effect" },
    { name: "useMemo", minimumArguments: 2, signal: "memo" },
    { name: "useCallback", minimumArguments: 2, signal: "memo" },
    { name: "useImperativeHandle", minimumArguments: 3, signal: "ref" },
  ];
  for (const hook of dependencySensitiveHooks) {
    for (const site of findCallSites(text, hook.name)) {
      if (countTopLevelArguments(text, site.openParen) >= hook.minimumArguments) continue;
      addInteractiveSignal(interactive, file, hook.signal);
      addFinding(interactive.findings, {
        code: "INTERACTIVE_OMITTED_DEPENDENCY_SEMANTICS",
        severity: "warning",
        category: "hooks",
        file,
        line: lineFor(site.offset),
        reason: `React ${hook.name} without a dependency argument runs or recreates every render, while Octane infers captures; use null for every-render parity or choose dependencies deliberately.`,
      });
    }
  }

  for (const match of text.matchAll(/\bReactDOM\.(?:render|hydrate|unmountComponentAtNode)\s*\(/g)) {
    addFinding(interactive.findings, {
      code: "INTERACTIVE_LEGACY_ROOT_REWRITE",
      severity: "blocker",
      category: "roots",
      file,
      line: lineFor(match.index),
      reason: "Legacy React roots are not available; select createRoot, hydrateRoot, or an explicit Octane compatibility boundary.",
    });
  }

  for (const match of text.matchAll(/\bReact\.(?:SyntheticEvent|ChangeEvent|FormEvent|MouseEvent|KeyboardEvent|FocusEvent|PointerEvent)\b|\b(?:SyntheticEvent|ChangeEvent|FormEvent|FocusEvent)\s*</g)) {
    addFinding(interactive.findings, {
      code: "INTERACTIVE_SYNTHETIC_EVENT_TYPE_REWRITE",
      severity: "warning",
      category: "events",
      file,
      line: lineFor(match.index),
      reason: "React synthetic event types do not describe Octane's real browser Event objects; retype named handlers against the native event and currentTarget contract.",
    });
  }

  for (const match of text.matchAll(/\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+(?:React\.)?(?:PureComponent|Component)\b/g)) {
    addInteractiveSignal(interactive, file, "state");
    addInteractiveSignal(interactive, file, "effect");
    addFinding(interactive.findings, {
      code: "INTERACTIVE_CLASS_COMPONENT_REWRITE",
      severity: "blocker",
      category: "lifecycle",
      file,
      line: lineFor(match.index),
      reason: "Octane has no class components; map state, lifecycle ownership, refs, context, and error behavior into reviewed function-component contracts.",
    });
  }

  for (const match of text.matchAll(/\b(?:contextTypes|childContextTypes|getChildContext)\b/g)) {
    addInteractiveSignal(interactive, file, "context");
    addFinding(interactive.findings, {
      code: "INTERACTIVE_LEGACY_CONTEXT_REWRITE",
      severity: "blocker",
      category: "context",
      file,
      line: lineFor(match.index),
      reason: "Legacy React context is unavailable; define a typed createContext provider/consumer ownership boundary.",
    });
  }

  if (/\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+(?:React\.)?(?:PureComponent|Component)\b/.test(text) && /\b(?:componentDidCatch|getDerivedStateFromError)\b/.test(text)) {
    const match = /\b(?:componentDidCatch|getDerivedStateFromError)\b/.exec(text);
    addInteractiveSignal(interactive, file, "boundary");
    addFinding(interactive.findings, {
      code: "INTERACTIVE_CLASS_ERROR_BOUNDARY_REWRITE",
      severity: "blocker",
      category: "boundaries",
      file,
      line: lineFor(match.index),
      reason: "Octane has no class error-boundary lifecycle; use a native try/catch block or function ErrorBoundary contract.",
    });
  }

  const cleanupPairs = [
    { setup: /\baddEventListener\s*\(/g, cleanup: /\bremoveEventListener\s*\(/, resource: "event listener" },
    { setup: /\bsetInterval\s*\(/g, cleanup: /\bclearInterval\s*\(/, resource: "interval" },
    { setup: /\brequestAnimationFrame\s*\(/g, cleanup: /\bcancelAnimationFrame\s*\(/, resource: "animation frame" },
    { setup: /\bnew\s+(?:IntersectionObserver|MutationObserver|ResizeObserver)\s*\(/g, cleanup: /\.(?:disconnect|unobserve)\s*\(/, resource: "observer" },
  ];
  if (["useEffect", "useLayoutEffect", "useInsertionEffect"].some((name) => findCallOffsets(text, name).length > 0)) {
    for (const resource of cleanupPairs) {
      const setups = [...text.matchAll(resource.setup)];
      if (setups.length > 0 && !resource.cleanup.test(text)) {
        for (const match of setups) {
          addFinding(interactive.findings, {
            code: "INTERACTIVE_EFFECT_CLEANUP_REVIEW",
            severity: "warning",
            category: "effects",
            file,
            line: lineFor(match.index),
            reason: `An effect appears to acquire an ${resource.resource} without a matching release in this module; verify ownership and cleanup.`,
          });
        }
      }
    }
  }
}

function makePathSummary(paths) {
  const sorted = uniqueSorted(paths);
  return {
    count: sorted.length,
    paths: sorted.slice(0, MAX_REPORTED_PATHS),
    truncated: sorted.length > MAX_REPORTED_PATHS,
  };
}

function makeLocationSummary(locations) {
  const unique = new Map();
  for (const location of locations) {
    unique.set(`${location.file}\0${location.line}\0${location.kind}`, location);
  }
  const sorted = [...unique.values()].sort(
    (left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.kind.localeCompare(right.kind),
  );
  return {
    count: sorted.length,
    locations: sorted.slice(0, MAX_REPORTED_PATHS),
    truncated: sorted.length > MAX_REPORTED_PATHS,
  };
}

function makeInteractiveReport(interactive) {
  const signalCounts = {};
  const entries = [...interactive.signalsByFile.entries()]
    .map(([file, signalSet]) => {
      const signals = [...signalSet].sort();
      for (const signal of signals) increment(signalCounts, signal);
      const checks = signals
        .map((signal) => MATRIX_CHECKS[signal])
        .filter(Boolean)
        .sort((left, right) => left.id.localeCompare(right.id));
      return { file, signals, checks };
    })
    .sort((left, right) => left.file.localeCompare(right.file));
  const checkCount = entries.reduce((total, entry) => total + entry.checks.length, 0);
  const findingItems = [...interactive.findings.items].sort(
    (left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.code.localeCompare(right.code),
  );

  return {
    summary: {
      files: entries.length,
      signals: makeCountSummary(signalCounts),
    },
    controls: {
      textEntry: makeLocationSummary(interactive.locations.text),
      checkable: makeLocationSummary(interactive.locations.checkable),
      select: makeLocationSummary(interactive.locations.select),
      uncontrolled: makeLocationSummary(interactive.locations.uncontrolled),
      forms: makeLocationSummary(interactive.locations.forms),
    },
    findings: {
      count: interactive.findings.count,
      items: findingItems,
      truncated: interactive.findings.count > findingItems.length,
    },
    stateMatrix: {
      files: entries.length,
      checks: checkCount,
      entries: entries.slice(0, MAX_REPORTED_PATHS),
      truncated: entries.length > MAX_REPORTED_PATHS,
    },
  };
}

function makeCountSummary(counter) {
  return Object.fromEntries(Object.entries(counter).sort(([left], [right]) => left.localeCompare(right)));
}

function escapeMarkdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function formatStateMatrix(report) {
  const lines = [
    "# Interactive parity matrix",
    "",
    `Source: \`${report.source}\``,
    "",
    "Generated from static signals. Confirm each row against the source behavior before porting.",
    "",
    "| File | Signal | Scenario | Expected parity |",
    "|---|---|---|---|",
  ];

  for (const entry of report.interactive.stateMatrix.entries) {
    for (const check of entry.checks) {
      lines.push(
        `| ${escapeMarkdownCell(entry.file)} | ${escapeMarkdownCell(check.id)} | ${escapeMarkdownCell(check.scenario)} | ${escapeMarkdownCell(check.expected)} |`,
      );
    }
  }
  if (report.interactive.stateMatrix.checks === 0) {
    lines.push("| — | — | No interactive signals detected. | Confirm the audit scope. |");
  }
  if (report.interactive.stateMatrix.truncated) {
    lines.push("", `Matrix output truncated after ${MAX_REPORTED_PATHS} files.`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatRouteManifest(report) {
  const routesById = new Map(report.routing.manifest.routes.map((route) => [route.id, route]));
  const lines = [
    "# Normalized route manifest",
    "",
    `Source: \`${report.source}\``,
    "",
    "Generated from bounded static signals. Confirm dynamic values, execution boundaries, and every checkpoint before editing source routes.",
    "",
    "| Source | Model | Path | Parent | Search | Redirects | Features | Target | Checkpoints |",
    "|---|---|---|---|---|---|---|---|---|",
  ];

  for (const route of report.routing.manifest.routes) {
    const parent = route.parentId ? routesById.get(route.parentId) : null;
    lines.push(
      `| ${escapeMarkdownCell(`${route.source.file}:${route.source.line}`)} | ${escapeMarkdownCell(route.model)} | ${escapeMarkdownCell(route.path.normalized ?? "review required")} | ${escapeMarkdownCell(parent?.path.normalized ?? "—")} | ${escapeMarkdownCell(route.search.keys.join(", ") || route.search.mode)} | ${escapeMarkdownCell(route.redirects.join(", ") || "—")} | ${escapeMarkdownCell(route.capabilities.join(", ") || "—")} | ${escapeMarkdownCell(`${route.target.candidate} (${route.target.status})`)} | ${escapeMarkdownCell(route.checkpoints.join(", "))} |`,
    );
  }
  if (report.routing.manifest.routes.length === 0) {
    lines.push("| — | — | No static routes inferred. | — | — | — | — | — | Review detected routing models manually. |");
  }

  lines.push("", "## Target decisions", "");
  for (const target of report.routing.targets) {
    lines.push(`- ${target.model}: ${target.candidate} (${target.status}) — ${target.reason}`);
  }
  if (report.routing.targets.length === 0) lines.push("- No routing protocol detected.");

  lines.push("", "## Application checkpoints", "");
  for (const checkpoint of report.routing.manifest.applicationCheckpoints) lines.push(`- ${checkpoint}`);
  if (report.routing.manifest.summary.unresolvedModels.length > 0) {
    lines.push("", `Unresolved models: ${report.routing.manifest.summary.unresolvedModels.join(", ")}.`);
  }
  return `${lines.join("\n")}\n`;
}

function calculateRisk({ blockers, warnings, routeIds }) {
  if (blockers.includes("NEXT_RSC_REWRITE") || blockers.includes("SERVER_ACTION_REWRITE")) return "critical";
  if (blockers.length > 0 || routeIds.some((id) => id !== "react-router-declarative" && id !== "custom-history")) return "high";
  if (warnings.length > 0 || routeIds.length > 0) return "medium";
  return "low";
}

export async function auditReactApp(source, options = {}) {
  const requestedStyle = options.style ?? "tailwind";
  if (!new Set(["tailwind", "css"]).has(requestedStyle)) {
    throw new Error("style must be either tailwind or css");
  }
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1) throw new Error("maxFiles must be a positive integer");

  const requestedRoot = path.resolve(source);
  const rootInfo = await lstat(requestedRoot);
  if (!rootInfo.isDirectory()) throw new Error(`Source is not a directory: ${requestedRoot}`);
  const root = await realpath(requestedRoot);
  const { files, skipped } = await collectCandidateFiles(root, maxFiles);

  const packages = [];
  const dependencies = new Map();
  const dependencySources = new Map();
  const routeSignals = new Map();
  const routing = createRoutingCollector();
  const styling = {
    cssFiles: [],
    cssModuleFiles: [],
    sassFiles: [],
    lessFiles: [],
    tailwindSignals: [],
    inlineStyleFiles: [],
    cssInJsFiles: [],
  };
  const react = {
    componentFiles: [],
    clientDirectiveFiles: [],
    serverDirectiveFiles: [],
    classComponentFiles: [],
    customHookFiles: [],
    textInputOnChangeFiles: [],
    hooks: {},
    apis: {},
    nextImports: [],
  };
  const interactive = {
    signalsByFile: new Map(),
    findings: createFindingCollector(),
    locations: {
      text: [],
      checkable: [],
      select: [],
      uncontrolled: [],
      forms: [],
    },
  };
  let customHistoryDetected = false;

  for (const candidate of files) {
    const text = await readFile(candidate.absolutePath, "utf8");
    routing.sourceFiles.add(candidate.relativePath);

    if (candidate.relativePath.endsWith("package.json")) {
      try {
        const manifest = JSON.parse(text);
        const packageDependencies = {
          ...(manifest.dependencies ?? {}),
          ...(manifest.devDependencies ?? {}),
          ...(manifest.peerDependencies ?? {}),
          ...(manifest.optionalDependencies ?? {}),
        };
        packages.push({
          path: candidate.relativePath,
          name: typeof manifest.name === "string" ? manifest.name : null,
          scripts: Object.keys(manifest.scripts ?? {}).sort(),
        });
        for (const [name, version] of Object.entries(packageDependencies)) {
          if (!dependencies.has(name)) dependencies.set(name, String(version));
          const sources = dependencySources.get(name) ?? new Set();
          sources.add(candidate.relativePath);
          dependencySources.set(name, sources);
        }
      } catch {
        packages.push({ path: candidate.relativePath, name: null, scripts: [], parseError: "invalid-json" });
      }
      continue;
    }

    registerRouteModuleFeatures(candidate.relativePath, text, routing);
    inspectRoutes(candidate.relativePath, text, routeSignals, routing);
    inspectStyling(candidate.relativePath, text, styling);
    inspectReact(candidate.relativePath, text, react);
    inspectInteractive(candidate.relativePath, text, react, interactive);
    if (/\b(?:history\.(?:pushState|replaceState)|popstate|location\.pathname)\b/.test(text)) customHistoryDetected = true;
  }

  const dependencyNames = [...dependencies.keys()].sort();
  const frameworks = [];
  if (dependencies.has("react") || react.componentFiles.length > 0) frameworks.push("react");
  if (dependencies.has("next")) frameworks.push("nextjs");
  if (dependencies.has("vite")) frameworks.push("vite");
  if (dependencies.has("react-scripts")) frameworks.push("create-react-app");
  if (dependencies.has("react-router") || dependencies.has("react-router-dom") || dependencies.has("@react-router/dev")) frameworks.push("react-router");
  if (dependencies.has("@tanstack/react-router")) frameworks.push("tanstack-router");
  if (dependencyNames.some((name) => name.startsWith("@remix-run/"))) frameworks.push("remix");
  if (customHistoryDetected) frameworks.push("custom-history");

  if (dependencies.has("next")) {
    for (const [id, entry] of routeSignals) {
      if (id.startsWith("next-")) entry.signals.add("next dependency");
    }
  }
  if (dependencyNames.some((name) => CSS_IN_JS_PACKAGES.has(name))) {
    styling.cssInJsFiles.push("package.json dependency");
  }
  if (dependencies.has("tailwindcss") || dependencies.has("@tailwindcss/vite")) {
    styling.tailwindSignals.push("package.json dependency");
  }

  const routes = [...routeSignals.entries()]
    .map(([id, entry]) => ({
      id,
      files: uniqueSorted(entry.files).slice(0, MAX_REPORTED_PATHS),
      signals: uniqueSorted(entry.signals),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const routeIds = routes.map((route) => route.id);
  const routingReport = finalizeRoutingCollector(routing, routes);

  const bindingCandidates = dependencyNames
    .map((name) => ({ name, binding: bindingCandidateFor(name) }))
    .filter((entry) => entry.binding !== null)
    .map(({ name, binding }) => ({
      source: name,
      candidate: binding.candidate,
      category: binding.category,
      status: "review-required",
      declaredIn: uniqueSorted(dependencySources.get(name) ?? []),
    }));
  const unknownReactDependencies = dependencyNames.filter(
    (name) => matchesPackagePattern(name) && !KNOWN_REACT_PACKAGES.has(name) && !bindingCandidateFor(name) && !CSS_IN_JS_PACKAGES.has(name),
  );

  const interactiveReport = makeInteractiveReport(interactive);

  const blockers = [];
  const warnings = [];
  if (routeIds.includes("next-app")) blockers.push("NEXT_RSC_REWRITE");
  if (react.serverDirectiveFiles.length > 0) blockers.push("SERVER_ACTION_REWRITE");
  if (react.classComponentFiles.length > 0) blockers.push("CLASS_COMPONENT_REWRITE");
  if ((react.apis.createRef ?? 0) > 0 || (react.apis.forwardRef ?? 0) > 0) blockers.push("REACT_API_REWRITE");
  if (interactive.findings.severities.has("blocker")) blockers.push("INTERACTIVE_API_REWRITE");
  if (routing.findings.severities.has("blocker")) blockers.push("ROUTE_TARGET_DECISION_REQUIRED");
  if (routeIds.length > 0) warnings.push("ROUTE_CONTRACT_REQUIRED");
  if (routeIds.length > 1) warnings.push("MULTIPLE_ROUTE_MODELS");
  if (routingReport.findings.count > 0) warnings.push("ROUTE_MANIFEST_REVIEW");
  if (routing.findings.codes.has("ROUTING_LOADER_TARGET_REQUIRED") || routing.findings.codes.has("ROUTING_ACTION_TARGET_REQUIRED")) {
    warnings.push("ROUTE_EXECUTION_TARGET_REQUIRED");
  }
  if (styling.cssInJsFiles.length > 0) warnings.push("CSS_IN_JS_PLAN");
  if (react.textInputOnChangeFiles.length > 0) warnings.push("NATIVE_INPUT_EVENT_REVIEW");
  if (interactive.findings.codes.has("INTERACTIVE_EFFECT_CLEANUP_REVIEW")) warnings.push("EFFECT_CLEANUP_REVIEW");
  if (interactive.findings.count > 0) warnings.push("INTERACTIVE_PARITY_REVIEW");
  if (bindingCandidates.length > 0) warnings.push("BINDING_SURFACE_REVIEW");
  if (unknownReactDependencies.length > 0) warnings.push("UNKNOWN_REACT_DEPENDENCIES");

  const recommendedPhases = ["foundation"];
  if (
    interactiveReport.summary.files > 0 ||
    bindingCandidates.length > 0 ||
    react.classComponentFiles.length > 0
  ) recommendedPhases.push("interactive");
  if (routeIds.length > 0) recommendedPhases.push("routing");
  if (frameworks.includes("nextjs") || frameworks.includes("remix") || react.serverDirectiveFiles.length > 0) {
    recommendedPhases.push("server");
  }

  const requiresServerTargetReview =
    frameworks.includes("nextjs") ||
    frameworks.includes("remix") ||
    react.serverDirectiveFiles.length > 0;
  const requiresRouterTargetDecision = routeIds.includes("react-router-framework") || routeIds.includes("tanstack-file");
  const target = requiresServerTargetReview
    ? { candidate: "rsbuild-full-app", status: "review-required" }
    : requiresRouterTargetDecision
      ? { candidate: "router-target-decision", status: "review-required" }
      : { candidate: "vite-spa", status: "default" };

  return {
    schemaVersion: SCHEMA_VERSION,
    source: root,
    requested: {
      styling: requestedStyle,
      destinationName: `${path.basename(root)}-beast`,
    },
    target,
    inventory: {
      candidateFiles: files.length,
      packages: packages.sort((left, right) => left.path.localeCompare(right.path)),
      skipped,
    },
    frameworks: uniqueSorted(frameworks),
    routing: {
      models: routes,
      requiresContractReview: routeIds.length > 0,
      ...routingReport,
    },
    styling: {
      tailwind: makePathSummary(styling.tailwindSignals),
      css: makePathSummary(styling.cssFiles),
      cssModules: makePathSummary(styling.cssModuleFiles),
      sass: makePathSummary(styling.sassFiles),
      less: makePathSummary(styling.lessFiles),
      inlineStyles: makePathSummary(styling.inlineStyleFiles),
      cssInJs: makePathSummary(styling.cssInJsFiles),
    },
    react: {
      components: makePathSummary(react.componentFiles),
      hooks: makeCountSummary(react.hooks),
      apis: makeCountSummary(react.apis),
      classComponents: makePathSummary(react.classComponentFiles),
      customHooks: makePathSummary(react.customHookFiles),
      clientDirectives: makePathSummary(react.clientDirectiveFiles),
      serverDirectives: makePathSummary(react.serverDirectiveFiles),
      textInputOnChange: makePathSummary(react.textInputOnChangeFiles),
      nextImports: uniqueSorted(react.nextImports),
    },
    interactive: interactiveReport,
    dependencies: {
      count: dependencyNames.length,
      bindingCandidates,
      unknownReactDependencies,
    },
    risk: {
      level: calculateRisk({ blockers, warnings, routeIds }),
      blockers: uniqueSorted(blockers),
      warnings: uniqueSorted(warnings),
    },
    recommendedPhases,
  };
}

function printHumanReport(report) {
  const modelNames = report.routing.models.map((model) => model.id).join(", ") || "none";
  const lines = [
    `React to Beast audit: ${report.source}`,
    `Requested styling: ${report.requested.styling}`,
    `Candidate target: ${report.target.candidate} (${report.target.status})`,
    `Frameworks: ${report.frameworks.join(", ") || "none detected"}`,
    `Candidate files: ${report.inventory.candidateFiles}`,
    `React components: ${report.react.components.count}`,
    `Interactive files: ${report.interactive.summary.files}`,
    `Interactive findings: ${report.interactive.findings.count}`,
    `Parity checks: ${report.interactive.stateMatrix.checks}`,
    `Route models: ${modelNames}`,
    `Normalized routes: ${report.routing.manifest.summary.routes}`,
    `Route findings: ${report.routing.findings.count}`,
    `Risk: ${report.risk.level}`,
    `Blockers: ${report.risk.blockers.join(", ") || "none"}`,
    `Warnings: ${report.risk.warnings.join(", ") || "none"}`,
    `Recommended phases: ${report.recommendedPhases.join(" → ")}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const report = await auditReactApp(options.source, options);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const matrix = formatStateMatrix(report);
  const routes = formatRouteManifest(report);

  if (options.json === "-") {
    process.stdout.write(json);
    return;
  }
  if (options.json) {
    const outputPath = path.resolve(options.json);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json, { encoding: "utf8", flag: options.force ? "w" : "wx" });
    process.stdout.write(`Wrote audit report to ${outputPath}\n`);
    return;
  }
  if (options.matrix === "-") {
    process.stdout.write(matrix);
    return;
  }
  if (options.matrix) {
    const outputPath = path.resolve(options.matrix);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, matrix, { encoding: "utf8", flag: options.force ? "w" : "wx" });
    process.stdout.write(`Wrote interactive parity matrix to ${outputPath}\n`);
    return;
  }
  if (options.routes === "-") {
    process.stdout.write(routes);
    return;
  }
  if (options.routes) {
    const outputPath = path.resolve(options.routes);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, routes, { encoding: "utf8", flag: options.force ? "w" : "wx" });
    process.stdout.write(`Wrote normalized route manifest to ${outputPath}\n`);
    return;
  }
  printHumanReport(report);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`react-beast-audit: ${error.message}\n`);
    process.exitCode = 1;
  });
}
