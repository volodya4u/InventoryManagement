// The human-approval workflow is the one check a branch cannot rewrite: pull_request_target runs main's copy of the
// workflow and, here, main's copy of the verifier. These tests pin what keeps it safe to run with a token next to an
// untrusted pull request: it never checks out or runs the pull request's code, interpolates no ${{ }} expression into a
// shell script, and asks for read access only. Run: node --test scripts/human-approval-workflow.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/human-approval.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = workflow.replace(/^\s*#.*$/gm, "");

test("the human-approval workflow runs main's verifier on pull_request_target and never runs the pull request's code", () => {
  // edited: retargeting a pull request to main is an `edited` event, and main's verifier must run on it.
  assert.match(code, /^on:\n {2}pull_request_target:\n {4}types: \[opened, synchronize, reopened, edited\]\n/m);
  assert.doesNotMatch(code, /^\s+pull_request:|^\s+push:|workflow_run|workflow_dispatch/m, "only pull_request_target triggers it");
  assert.match(code, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(code, /write|secrets\./, "no write permission and no secret");
  // The checkout has no ref: it checks out the base (main), never the pull request's head.
  const checkout = /- uses: actions\/checkout@v\d+\n((?: {8}.*\n)*)/.exec(code);
  assert.ok(checkout, "one checkout step");
  assert.doesNotMatch(checkout[1], /ref:/);
  // The pull request's head is fetched as data, compared with the event's SHA, and only read by git verify-tag.
  assert.match(code, /git fetch -q origin "\+refs\/pull\/\$\{PR_NUMBER\}\/head:refs\/remotes\/pr\/head" "\+refs\/tags\/approve\/\*:refs\/tags\/approve\/\*"/);
  assert.match(code, /test "\$\(git rev-parse refs\/remotes\/pr\/head\)" = "\$HEAD_SHA"/);
  assert.match(code, /node scripts\/signed-approval\.mjs HEAD "\$HEAD_SHA" --ci \| tee -a "\$GITHUB_STEP_SUMMARY"/);
  assert.doesNotMatch(code, /npm|pnpm|mvn|node scripts\/(?!signed-approval\.mjs)/, "nothing else runs");
  // Expressions reach the script only through env, never inside run: blocks; pipefail keeps tee from hiding a FAIL.
  for (const block of code.split(/\n {8}run: \|\n/).slice(1)) assert.doesNotMatch(block.split(/\n {6}-/)[0], /\$\{\{/);
  assert.match(code, /shell: bash/);
});
