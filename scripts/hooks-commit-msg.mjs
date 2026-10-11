#!/usr/bin/env node
// Git commit-msg hook, run through .githooks/commit-msg (ADR-0002). Warn-only: a commit that touches production code
// (Java under src/main, the Angular app outside *.spec.ts) without a `Slice:` or `Refs:` trailer gets a reminder, and
// the commit goes ahead. The trailers make `git log --grep "FR-103"` an audit trail, and `gate-status` reads `Slice:`
// for the G4+ gates. Adapted from the factory's template, which blocked every commit under src/ and so would have
// blocked every Java commit in this repo.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PRODUCTION_CODE = /^(src\/main\/|frontend\/src\/.+\.(ts|html|scss)$)/;
const SPEC_FILE = /\.spec\.ts$/;

export function touchesProductionCode(staged) {
  return staged.some((file) => PRODUCTION_CODE.test(file) && !SPEC_FILE.test(file));
}

const ID = "(?:FR|NFR|TC|BC|BUG|PD)-(?:[A-Z0-9]+-)?\\d+";
const REFS = new RegExp(`^Refs:[ \\t]*${ID}(?:,[ \\t]*${ID})*[ \\t]*\\r?$`, "m");
const SLICE = /^Slice:[ \t]*[a-z0-9-]+[ \t]*\r?$/m;

export function hasTraceTrailer(message) {
  return REFS.test(message) || SLICE.test(message);
}

export function commitMsgWarning(staged, message) {
  if (!touchesProductionCode(staged) || hasTraceTrailer(message)) return null;
  return [
    "commit-msg: this commit touches production code but has no Slice: or Refs: trailer (a reminder only: the commit goes ahead).",
    "Add one or both lines to the message body so `git log --grep` finds it:",
    "  Slice: add-<capability>",
    "  Refs: FR-12, FR-13",
    "(Refs: BUG-<n> for a bug fix; Refs: PD-<n> for an approved change to a gate script.)",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const message = readFileSync(process.argv[2], "utf8");
    const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const warning = commitMsgWarning(staged, message);
    if (warning) console.error(warning);
  } catch {
    /* a reminder must never stop a commit */
  }
}
