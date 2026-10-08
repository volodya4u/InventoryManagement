#!/usr/bin/env node
// The docs-lookup gate: AGENTS.md tells the agent to look an API up before the first import of a package nothing on
// `main` imports yet (a Java package, or an npm module / entry point such as `@angular/common/http`). This turns that
// rule into a check. A branch that adds such an import must carry at least one recorded docs lookup —
// `mcp__context7__query-docs` or `mcp__angular-cli__search_documentation` — in its agent log.
// Pure helpers, imported by scripts/pr-evidence.mjs the way check-review.mjs and check-specs.mjs are; the CLI below
// runs the same check on its own.
// Known limits:
//   - The hook (.claude/hooks/log-action.mjs, off-limits) records a tool call's name, not its query, so the gate
//     proves a docs lookup ran on the branch, not which library it was about.
//   - The order is not checked: a lookup after the import still counts.
//   - Only Claude Code's own tool calls are logged, so for another agent (e.g. Codex) the gate fails by design, as
//     the Review gate does; such a branch records the lookup some other way or a human waives it.
// Usage (from the repo root): node scripts/check-docs-lookup.mjs <base-ref> [head-ref]   (base default head: HEAD)
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { addedLogLines } from "./check-review.mjs";

// A Java import's package: the segments before the first capitalised one (the class or static member), so
// `org.mockito.Mockito.when` and `org.mockito.*` both give `org.mockito`, and
// `org.springframework.security.web.session.HttpSessionEventPublisher` gives `...security.web.session`.
const JAVA_IMPORT = /^\s*import\s+(?:static\s+)?([\w.]+?)(?:\.\*)?\s*;/;
const javaPackage = (name) => {
  const seg = name.split(".");
  const upper = seg.findIndex((s) => /^[A-Z]/.test(s));
  return (upper < 0 ? seg : seg.slice(0, upper)).join(".");
};
// Packages that are the JDK or our own code, never a third-party library to look up.
const SKIP_JAVA = /^(java|javax|jdk)(\.|$)|^com\.flowershop(\.|$)/;

// A TypeScript import's module specifier, from a one-line `import … from '…'`, an `export … from '…'`, the closing
// `} from '…'` line of a multi-line import, or a side-effect `import '…'`. The key is the whole specifier, so a new
// entry point of an already-used scope (`@angular/common/http` next to `@angular/common`) still counts.
const TS_FROM = /^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/;
const TS_CLOSE = /^\s*\}\s*from\s*['"]([^'"]+)['"]/;
const TS_SIDE = /^\s*import\s*['"]([^'"]+)['"]/;

// Every third-party import key (`java:<pkg>` or `ts:<specifier>`) in a block of file text (one line or many). The
// path only picks the language. A relative TS path is the project's own code, so it is skipped.
export function importKeys(path, text) {
  const java = path.endsWith(".java");
  if (!java && !path.endsWith(".ts")) return [];
  const keys = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (java) {
      const m = JAVA_IMPORT.exec(line);
      if (!m) continue;
      const pkg = javaPackage(m[1]);
      if (pkg && !SKIP_JAVA.test(pkg)) keys.push(`java:${pkg}`);
    } else {
      const spec = (TS_FROM.exec(line) ?? TS_CLOSE.exec(line) ?? TS_SIDE.exec(line))?.[1];
      if (spec && !spec.startsWith(".")) keys.push(`ts:${spec}`);
    }
  }
  return keys;
}

// The import keys on the `+` lines of a `git diff -U0` over src and frontend/src. Adding a name to an existing
// multi-line import leaves its `} from` line unchanged, so it is not a `+` line and does not count — correct, the
// module was already imported.
export function addedImports(diffText) {
  const keys = new Set();
  let path = null;
  for (const line of String(diffText).split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      path = line.replace(/^\+\+\+ (?:b\/)?/, "");
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    for (const key of importKeys(path ?? "", line.slice(1))) keys.add(key);
  }
  return [...keys];
}

// Every import key present at a ref. Two greps, one per language, so each line's language is known. `[[:space:]]`,
// not `\s`: Git for Windows' ERE has no `\s`, and silently matches nothing with it.
export function knownImports(root, ref) {
  const grep = (pattern, pathspec) => {
    try {
      return execFileSync("git", ["-C", root, "grep", "-h", "-E", pattern, ref, "--", pathspec], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
      if (error.status === 1) return ""; // git grep exits 1 when nothing matches
      throw error;
    }
  };
  const keys = new Set();
  for (const key of importKeys("x.java", grep("^[[:space:]]*import[[:space:]]", "src/*.java"))) keys.add(key);
  for (const key of importKeys("x.ts", grep("^[[:space:]]*(import|export|})", "frontend/src/*.ts"))) keys.add(key);
  return keys;
}

const DOCS_TOOL = /^mcp__(context7__query-docs|angular-cli__search_documentation)$/;
const packageOf = (key) => key.replace(/^(java|ts):/, "");

// The docs lookups a branch recorded: executed calls (PostToolUse, exit 0), not proposals or failures.
export const docsLookupCount = (toolLines) => toolLines.filter((e) => e.event === "PostToolUse" && e.exit === 0 && DOCS_TOOL.test(e.tool)).length;

// What is missing for the gate to hold: [] when no library is new, or when a new library's import is paired with at
// least one recorded docs lookup (either tool satisfies any new import). Otherwise one message naming the packages.
export function docsLookupProblems(newKeys, toolLines) {
  if (!newKeys.length || docsLookupCount(toolLines) > 0) return [];
  const packages = newKeys.map(packageOf);
  const angular = packages.some((p) => p.startsWith("@angular/"));
  return [
    `This branch adds imports from ${packages.join(", ")}, new to main, but records no docs lookup: call ` +
      `\`mcp__context7__query-docs\`${angular ? " (`mcp__angular-cli__search_documentation` for @angular/*)" : ""} ` +
      "before writing that code, then commit so the record folds in.",
  ];
}

// The new import keys of a branch: added over the merge base, minus everything main's tip already imports.
export function newImportKeys(root, base, head) {
  const diff = execFileSync("git", ["-C", root, "diff", "-U0", `${base}...${head}`, "--", "src", "frontend/src"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const known = knownImports(root, base);
  return addedImports(diff).filter((key) => !known.has(key));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) {
    console.error("Usage: node scripts/check-docs-lookup.mjs <base-ref> [head-ref]");
    process.exit(2);
  }
  const root = process.cwd();
  const tools = addedLogLines(base, head).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  const newKeys = newImportKeys(root, base, head);
  const problems = docsLookupProblems(newKeys, tools);
  if (!problems.length) {
    console.log(newKeys.length ? `Docs lookup: ${docsLookupCount(tools)} lookup(s) recorded for ${newKeys.map(packageOf).join(", ")}.` : "Docs lookup: no new third-party import on this branch.");
    process.exit(0);
  }
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
