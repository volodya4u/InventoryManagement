#!/usr/bin/env node
// The owner's approval of a pull request (ADR-0005, slice 3 step B). Run it yourself after reading the pull request and
// its reviewer report: it signs the annotated tag approve/<head-sha> with your SSH signing key, which must be a
// hardware-backed (sk-) key listed in quality/allowed-signers on main, so the signature needs a physical touch. It then
// checks the tag the way CI will, pushes that one tag, and re-runs the two checks that read it (the human-approval
// workflow and the pr-evidence job), because a pushed tag does not trigger them.
// The agent must not run this (CLAUDE.md); without the key's touch it cannot finish anyway.
// Setup, once: git config gpg.format ssh && git config user.signingkey ~/.ssh/id_ed25519_sk.pub
// Usage: node scripts/approve-pr.mjs <pr-number>   (exit 0 = approved and pushed, 1 = failed, 2 = usage)
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { signedApproval } from "./signed-approval.mjs";

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();

function main() {
  const pr = process.argv[2];
  if (!/^\d+$/.test(pr ?? "") || process.argv.length > 3) {
    console.error("Usage: node scripts/approve-pr.mjs <pr-number>");
    process.exit(2);
  }
  const info = JSON.parse(sh("gh", ["pr", "view", pr, "--json", "headRefOid,state,url,title"]));
  if (info.state !== "OPEN") throw new Error(`#${pr} is ${info.state}, not open`);
  const sha = info.headRefOid;
  const tag = `approve/${sha}`;
  sh("git", ["fetch", "-q", "origin", "main", `+refs/pull/${pr}/head:refs/remotes/pr/${pr}`]);
  if (sh("git", ["rev-parse", `refs/remotes/pr/${pr}`]) !== sha) throw new Error("the fetched head does not match the pull request's head");
  console.log(`Approving #${pr} "${info.title}" at ${sha}\n${info.url}\nTouch your security key when it blinks.`);
  // The signature: git calls ssh-keygen with your user.signingkey, which asks for the touch.
  sh("git", ["-c", "gpg.format=ssh", "tag", "-s", "-m", `Approve #${pr} (${info.url}) at ${sha}`, tag, sha], { stdio: ["inherit", "pipe", "inherit"] });
  const check = signedApproval(process.cwd(), { base: "origin/main", head: sha });
  if (check.state !== "valid") {
    sh("git", ["tag", "-d", tag]);
    throw new Error(`the new tag would not pass CI (${check.state}${check.reason ? `: ${check.reason}` : ""}); is your key in quality/allowed-signers on main?`);
  }
  sh("git", ["push", "origin", `refs/tags/${tag}:refs/tags/${tag}`], { stdio: ["ignore", "pipe", "inherit"] });
  console.log(`Pushed ${tag}, signed by ${check.signer}.`);
  rerun(pr, sha);
}

// Re-run the latest human-approval run for this pull request and the pr-evidence job of the latest CI run on its head.
function rerun(pr, sha) {
  const runs = (query) => JSON.parse(sh("gh", ["api", `repos/{owner}/{repo}/actions/runs?${query}&per_page=50`])).workflow_runs ?? [];
  const approval = runs("event=pull_request_target").find((r) => r.path?.endsWith("human-approval.yml") && r.pull_requests?.some((p) => String(p.number) === pr));
  const ci = runs(`event=pull_request&head_sha=${sha}`).find((r) => r.path?.endsWith("ci.yml"));
  if (approval) {
    sh("gh", ["run", "rerun", String(approval.id)]);
    console.log(`Re-running human-approval: ${approval.html_url}`);
  } else console.log("No human-approval run found for this pull request: re-run it from the pull request's Checks tab.");
  const job = ci && JSON.parse(sh("gh", ["api", `repos/{owner}/{repo}/actions/runs/${ci.id}/jobs`])).jobs?.find((j) => j.name === "pr-evidence");
  if (job) {
    sh("gh", ["run", "rerun", "--job", String(job.id)]);
    console.log(`Re-running pr-evidence: ${ci.html_url}`);
  } else console.log("No pr-evidence job found on the head commit: re-run it from the pull request's Checks tab.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`approve-pr: ${error.message}`);
    process.exit(1);
  }
}
