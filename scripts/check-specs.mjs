#!/usr/bin/env node
// Specs are checked against the tests they name, so a spec cannot drift from what was built unnoticed. One did: the
// reorder-level spec's AC5 promised a "Low stock" card while the card and its test said "Low Stock".
// For each docs/specs/*.md except TEMPLATE.md:
//   - the Status line reads "Approved by <who> on <YYYY-MM-DD>", and no template placeholder (<...>) is left;
//   - each acceptance criterion names a test that exists: `Class` › `method` (a JUnit method under src/test/java),
//     `frontend/...spec.ts` › "title" (an it(...) or test(...) with that title in that file) or
//     `scripts/...test.mjs` › "title" (a node:test test with that title);
//   - each "double-quoted" text in its Given / When / Then appears verbatim in that test's file: quoted text is exact
//     UI or API copy (docs/specs/TEMPLATE.md). The check reads the whole file, not only the named test.
// The acceptance table of each active OpenSpec change (openspec/changes/<slice>/proposal.md, not archive/) is checked the
// same way when it has one; a slice proposal has no Status line. In a pull request, a proposal the branch adds is checked
// too, archived or not. scripts/pr-evidence.mjs asks a slice the branch adds for the table, and for red -> green on each
// criterion the branch adds or changes.
// In a pull request (prSpecProblems, also run by scripts/pr-evidence.mjs): a spec the branch adds is committed before
// the first commit that touches src/ or frontend/src/, and a change to schema.sql, a controller and a page together
// adds or edits a spec.
// Usage: node scripts/check-specs.mjs [base-ref [head-ref]]   (repo root; exit 0 = consistent, 1 = problems)
// node --test scripts/check-specs.test.mjs checks this repository's specs too, so CI fails on a drifted spec.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { findFiles } from "./dod-checks.mjs";

const SPEC_PATH = /^docs\/specs\/(?!TEMPLATE\.md$)[^/]+\.md$/;
const CODE_PATH = /^(src|frontend\/src)\//;
const PROPOSAL_PATH = /^openspec\/changes\/(archive\/)?[^/]+\/proposal\.md$/;
const APPROVED = /^Approved by \S.* on \d{4}-\d{2}-\d{2}$/;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The prose of a Markdown text: HTML comments, fenced blocks and inline code spans removed.
const prose = (text) => text.replace(/<!--[\s\S]*?-->/g, "").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

// The cells of a table row; a | inside a code span does not split a cell.
export function tableCells(row) {
  const found = [];
  let cell = "";
  let code = false;
  for (const ch of row.trim().replace(/^\|/, "").replace(/\|$/, "")) {
    if (ch === "`") code = !code;
    if (ch === "|" && !code) {
      found.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  found.push(cell.trim());
  return found;
}

// `Class` › `method` -> a JUnit method; `frontend/...spec.ts` › "title" -> a Vitest test in that file;
// `scripts/...test.mjs` › "title" -> a node:test test in that file.
function testRef(cell) {
  const parts = cell.split("›");
  if (parts.length !== 2) return null;
  const left = parts[0].replace(/`/g, "").trim();
  const right = parts[1].replace(/`/g, "").trim().replace(/^["“](.*)["”]$/, "$1");
  if (!left || !right) return null;
  return /\.(spec|test)\.ts$|\.test\.mjs$/.test(left) ? { file: left, title: right } : { className: left, method: right };
}

const describe = (ref) => (ref.file ? `${ref.file} › "${ref.title}"` : `${ref.className} › ${ref.method}`);

export function parseSpec(text) {
  const t = text.replace(/\r\n?/g, "\n");
  const status = /^Status:[ \t]*(.*?)[ \t]*$/m.exec(t)?.[1] ?? null;
  const placeholders = [...new Set([...prose(t).matchAll(/<[A-Za-z][\w .'-]*>/g)].map((m) => m[0]))];
  const start = t.search(/^##[ \t]+Acceptance criteria[ \t]*$/m);
  const section = start < 0 ? "" : t.slice(start).split("\n").slice(1).join("\n").split(/^##[ \t]/m)[0];
  const criteria = section
    .split("\n")
    .filter((line) => /^\s*\|/.test(line))
    .map(tableCells)
    .filter((c) => c.length >= 3 && /^\d+$/.test(c[0]))
    .map(([n, gwt, cell]) => ({
      n: Number(n),
      gwt,
      testCell: cell,
      test: testRef(cell),
      quotes: [...prose(gwt).matchAll(/"([^"\n]+)"|“([^”\n]+)”/g)].map((m) => m[1] ?? m[2]),
    }));
  return { status, placeholders, criteria };
}

// The source the criterion's test lives in, or why it cannot be found.
function locate(root, ref) {
  if (ref.file) {
    const full = join(root, ref.file);
    if (!existsSync(full)) return { problem: `${ref.file} does not exist` };
    const source = readFileSync(full, "utf8");
    const titled = ["'", '"', "`"].some((q) => new RegExp(`\\b(?:it|test)\\(\\s*${q}${escape(ref.title)}${q}`).test(source));
    return titled ? { file: ref.file, source } : { problem: "that file has no test with this title" };
  }
  const files = findFiles(join(root, "src", "test", "java"), new RegExp(`^${escape(ref.className)}\\.java$`));
  if (!files.length) return { problem: `no ${ref.className}.java exists under src/test/java` };
  const source = readFileSync(files[0], "utf8");
  if (!new RegExp(`\\bvoid\\s+${escape(ref.method)}\\s*\\(`).test(source)) return { problem: `${ref.className} has no method ${ref.method}` };
  return { file: relative(root, files[0]).replace(/\\/g, "/"), source };
}

export function specProblems(root, path) {
  const spec = parseSpec(readFileSync(join(root, path), "utf8"));
  const problems = [];
  if (!spec.status || !APPROVED.test(spec.status)) {
    problems.push(`${path}: Status must read "Approved by <who> on <YYYY-MM-DD>" (found "${spec.status ?? "no Status line"}")`);
  }
  for (const placeholder of spec.placeholders) problems.push(`${path}: template placeholder ${placeholder} left in the spec`);
  if (!spec.criteria.length) problems.push(`${path}: no acceptance criteria table`);
  return [...problems, ...criteriaProblems(root, path, spec.criteria)];
}

// Each criterion names a test that exists and holds the criterion's quoted text.
function criteriaProblems(root, path, criteria) {
  const problems = [];
  for (const c of criteria) {
    if (!c.test) {
      problems.push(`${path}: AC${c.n} names no test as \`Class\` › \`method\`, \`path.spec.ts\` › "title" or \`scripts/x.test.mjs\` › "title" (found "${c.testCell}")`);
      continue;
    }
    const found = locate(root, c.test);
    if (found.problem) {
      problems.push(`${path}: AC${c.n} names ${describe(c.test)}, but ${found.problem}`);
      continue;
    }
    for (const quote of c.quotes) {
      if (!found.source.includes(quote)) {
        problems.push(`${path}: AC${c.n} quotes "${quote}", which ${found.file} does not contain (quoted text is exact copy: update the spec or the code so they agree)`);
      }
    }
  }
  return problems;
}

// The active OpenSpec changes that have a proposal.md (archive/ holds finished slices, whose tests may since be renamed).
function activeProposals(root) {
  const dir = join(root, "openspec", "changes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "archive" && existsSync(join(dir, e.name, "proposal.md")))
    .map((e) => `openspec/changes/${e.name}/proposal.md`)
    .sort();
}

export function validateSpecs(root) {
  const dir = join(root, "docs", "specs");
  const specs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "TEMPLATE.md").sort() : [];
  const problems = [
    ...specs.flatMap((f) => specProblems(root, `docs/specs/${f}`)),
    ...activeProposals(root).flatMap((path) => criteriaProblems(root, path, parseSpec(readFileSync(join(root, path), "utf8")).criteria)),
  ];
  return { ok: problems.length === 0, specs, problems };
}

export function prSpecProblems(root, base, head = "HEAD") {
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const commits = git("rev-list", "--reverse", "--topo-order", `${base}..${head}`).split("\n").filter(Boolean);
  const changes = commits.map((sha) =>
    git("diff-tree", "--no-commit-id", "--name-status", "-r", sha)
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [status, ...paths] = line.split("\t");
        return { status, path: paths.at(-1) };
      }),
  );
  const problems = [];
  const firstCode = changes.findIndex((files) => files.some((f) => CODE_PATH.test(f.path)));
  changes.forEach((files, i) => {
    for (const f of files) {
      if (f.status === "A" && SPEC_PATH.test(f.path) && firstCode !== -1 && firstCode <= i) {
        problems.push(
          `${f.path} was committed after code (${commits[firstCode].slice(0, 7)} touches src/ or frontend/src/ first): ` +
            "commit the approved spec before the code (AGENTS.md)",
        );
      }
    }
  });
  const changed = git("diff", "--name-only", `${base}...${head}`).split("\n").filter(Boolean);
  const schema = changed.includes("src/main/resources/schema.sql");
  const controller = changed.some((p) => /^src\/main\/java\/.*Controller\.java$/.test(p));
  const page = changed.some((p) => /^frontend\/src\/app\/.*\.(ts|html|scss)$/.test(p) && !/\.spec\.ts$/.test(p));
  if (schema && controller && page && !changed.some((p) => SPEC_PATH.test(p))) {
    problems.push(
      "This branch changes schema.sql, a controller and a page together, but adds or edits no spec in docs/specs/ " +
        "(AGENTS.md: such a feature starts with an approved spec).",
    );
  }
  // A slice proposal the branch adds straight under archive/ is checked like an active one (validateSpecs already checks
  // the active ones). -M is explicit, so archiving an old slice is a rename, not a new file, whatever diff.renames says.
  const added = git("diff", "--name-only", "-M", "--diff-filter=A", `${base}...${head}`)
    .split("\n")
    .filter((p) => PROPOSAL_PATH.test(p) && p.startsWith("openspec/changes/archive/"));
  for (const path of added) problems.push(...criteriaProblems(root, path, parseSpec(git("show", `${head}:${path}`)).criteria));
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head = "HEAD"] = process.argv.slice(2);
  const root = process.cwd();
  const { specs, problems } = validateSpecs(root);
  const all = [...problems, ...(base ? prSpecProblems(root, base, head) : [])];
  if (!all.length) {
    const order = base ? `; spec-first order and the cross-layer rule hold on ${base}..${head}` : "";
    console.log(`Specs: ${specs.length} spec(s) consistent with the tests they name${order}.`);
    process.exit(0);
  }
  console.error("Spec problems:\n" + all.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
