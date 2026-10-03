#!/usr/bin/env node
// Checks that a pull request description fills in the two required sections of .github/pull_request_template.md:
//   ## Evidence (`dod.mjs`)  -> not empty, and holds the dod.mjs table (or at least names dod.mjs)
//   ## Reviewer verdict      -> not empty, and says APPROVE
// HTML comments (the template's hints) do not count as content.
// Run by .github/workflows/pr-description.yml, which skips Dependabot pull requests.
// Usage: PR_BODY="..." node scripts/check-pr-description.mjs   (exit code 0 = complete, 1 = something is missing)
import { pathToFileURL } from "node:url";

function section(body, title) {
  const heading = new RegExp(`^##[ \\t]+${title}\\b.*$`, "im").exec(body);
  if (!heading) return null;
  const rest = body.slice(heading.index + heading[0].length);
  const next = /^##[ \t]/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export function checkPrDescription(rawBody) {
  const body = String(rawBody ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "");
  const problems = [];

  const evidence = section(body, "Evidence");
  if (evidence === null) problems.push('Missing the "## Evidence (`dod.mjs`)" section.');
  else if (!evidence) problems.push("The Evidence section is empty: paste the table `node scripts/dod.mjs` printed.");
  else if (!/^\s*\|.*\|\s*$/m.test(evidence) && !/dod\.mjs/.test(evidence)) {
    problems.push("The Evidence section has neither the dod.mjs table nor a dod.mjs result.");
  }

  const verdict = section(body, "Reviewer verdict");
  if (verdict === null) problems.push('Missing the "## Reviewer verdict" section.');
  else if (!verdict) problems.push("The Reviewer verdict section is empty: give the reviewer subagent's verdict.");
  else if (!/\bAPPROVE\b/.test(verdict)) {
    problems.push("The Reviewer verdict section does not say APPROVE: fix or answer the blocking findings first.");
  }

  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const problems = checkPrDescription(process.env.PR_BODY);
  if (problems.length) {
    console.error("The pull request description is incomplete (see .github/pull_request_template.md):");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log("The pull request description has the Evidence and Reviewer verdict sections.");
}
