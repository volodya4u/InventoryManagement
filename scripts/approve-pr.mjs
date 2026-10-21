#!/usr/bin/env node
// The owner's approval of a pull request (ADR-0005, slice 3 step B). Run it yourself after reading the pull request and
// its reviewer report: it signs the annotated tag approve/<head-sha> with your SSH signing key, which must be a
// hardware-backed (sk-) key listed in quality/allowed-signers on main, so the signature needs a physical touch. It then
// checks the tag the way CI will, pushes that one tag, and re-runs the two checks that read it (the human-approval
// workflow and the pr-evidence job), because a pushed tag does not trigger them.
// The agent must not run this (CLAUDE.md); without the key's touch it cannot finish anyway.
// Run it from a checkout of main the agent has not touched: the touch proves that a signature was made, not what was
// signed, so a tool the agent edited could ask for a touch on another commit. The script refuses to run when it or its
// verifier differs from origin/main, and it pins git's ssh signing program, but a tool cannot vouch for itself: a
// separate clone the agent never works in is the safe place (ADR-0005).
// The signing program is plain ssh-keygen unless your GLOBAL git config names one by absolute path; a repository's own
// gpg.ssh.program is ignored. On Windows, Git for Windows' bundled ssh-keygen may not reach a FIDO2 key, while
// Windows' own OpenSSH does: git config --global gpg.ssh.program C:/Windows/System32/OpenSSH/ssh-keygen.exe
// The script prints the program before asking for the touch; the agent runs as the same OS user and could write your
// global config too, so check that line.
// Setup, once: git config gpg.format ssh && git config user.signingkey ~/.ssh/id_ed25519_sk.pub
// Usage: node scripts/approve-pr.mjs <pr-number>   (exit 0 = approved and pushed, 1 = failed, 2 = usage)
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { signedApproval } from "./signed-approval.mjs";

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();

// The approval tool and its verifier: both must be main's, since a changed copy could sign something other than it shows.
export const APPROVAL_TOOLS = ["scripts/approve-pr.mjs", "scripts/signed-approval.mjs"];

// Why the approval tools here cannot be trusted, or null, from the spawnSync result of
// `git diff --name-only origin/main -- <APPROVAL_TOOLS>`. A failed comparison refuses too, never reads as no difference.
export function driftProblem({ status, stdout, stderr, error }) {
  if (status !== 0) {
    const why = String(stderr ?? "").trim().split(/\r?\n/)[0] || error?.message || `git diff exited ${status}`;
    return `could not compare ${APPROVAL_TOOLS.join(" and ")} with origin/main: ${why}`;
  }
  const changed = String(stdout ?? "").split(/\r?\n/).filter(Boolean);
  if (!changed.length) return null;
  return `${changed.join(" and ")} ${changed.length > 1 ? "differ" : "differs"} from origin/main here: run this from a clean checkout of main`;
}

// The program git signs with: the owner's gpg.ssh.program from the GLOBAL config (`git config --global --get`) when it
// is an absolute path, else plain ssh-keygen. A repository-local setting is never read, so a checkout cannot swap in
// another program; a relative name or a network path falls back too.
export function signingProgram(globalProgram) {
  const program = String(globalProgram ?? "").trim();
  return /^([A-Za-z]:[\\/]|\/(?!\/))/.test(program) ? program : "ssh-keygen";
}

// A failed command in words: git's first line on stderr when it was captured, else its exit code. Never the raw
// "Command failed: …" of execFileSync.
const why = (error) => String(error?.stderr ?? "").trim().split(/\r?\n/)[0] || (error?.status != null ? `git exited ${error.status}` : String(error?.message ?? error).split("\n")[0]);

// Push the signed tag, unless origin has it already. On any failure the new local tag is deleted, so a second run
// starts clean. `run(cmd, args, opts)` returns a command's trimmed stdout or throws as execFileSync does.
export function pushApproval({ tag, sha, run }) {
  const ref = `refs/tags/${tag}`;
  const drop = () => {
    try {
      run("git", ["tag", "-d", tag]);
    } catch {
      // Nothing to add: the message below says what failed.
    }
  };
  let remote;
  try {
    remote = run("git", ["ls-remote", "--tags", "origin", ref]);
  } catch (error) {
    drop();
    throw new Error(`could not read the tags on origin (${why(error)}); deleted the new local ${tag}: run this again when origin is reachable`);
  }
  // ls-remote matches its pattern against the end of each ref, so only the exact ref (or its peeled line) counts.
  if (remote.split(/\r?\n/).some((line) => [ref, `${ref}^{}`].includes(line.split("\t")[1]))) {
    drop();
    throw new Error(
      `${tag} is already on origin, so this commit already has an approval tag; deleted the new local one and pushed nothing.\n` +
        `Check the one on origin: git fetch -q origin "+refs/tags/approve/*:refs/tags/approve/*" && node scripts/signed-approval.mjs origin/main ${sha} --ci\n` +
        `If it is not a valid approval, delete it on origin (git push origin :${ref}) and run this again.`,
    );
  }
  try {
    run("git", ["push", "origin", `${ref}:${ref}`], { stdio: ["ignore", "pipe", "inherit"] });
  } catch (error) {
    drop();
    throw new Error(`the push of ${tag} failed (${why(error)}); deleted the new local tag: run this again`);
  }
}

// The runs to re-run once the tag is pushed, from the GitHub API's lists. The workflow path must match exactly, and the
// newest run wins by creation time, whatever order the API returned.
const newest = (runs) => [...(runs ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
export const approvalRun = (runs, pr) =>
  newest((runs ?? []).filter((r) => r.path === ".github/workflows/human-approval.yml" && r.pull_requests?.some((p) => String(p.number) === String(pr))));
export const ciRun = (runs, sha) => newest((runs ?? []).filter((r) => r.path === ".github/workflows/ci.yml" && r.head_sha === sha));
export const evidenceJob = (jobs) => (jobs ?? []).find((j) => j.name === "pr-evidence");

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
  const drift = driftProblem(spawnSync("git", ["diff", "--name-only", "origin/main", "--", ...APPROVAL_TOOLS], { encoding: "utf8" }));
  if (drift) throw new Error(drift);
  // The signature: git calls the signing program with your user.signingkey, which asks for the touch.
  // gpg.ssh.program is pinned on the command line, so a repository-local setting cannot swap in another program.
  const program = signingProgram(spawnSync("git", ["config", "--global", "--get", "gpg.ssh.program"], { encoding: "utf8" }).stdout);
  console.log(`Approving #${pr} "${info.title}" at ${sha}\n${info.url}\nSigning with ${program}. Touch your security key when it blinks.`);
  const signing = ["-c", "gpg.format=ssh", "-c", `gpg.ssh.program=${program}`];
  sh("git", [...signing, "tag", "-s", "-m", `Approve #${pr} (${info.url}) at ${sha}`, tag, sha], { stdio: ["inherit", "pipe", "inherit"] });
  const check = signedApproval(process.cwd(), { base: "origin/main", head: sha });
  if (check.state !== "valid") {
    sh("git", ["tag", "-d", tag]);
    throw new Error(`the new tag would not pass CI (${check.state}${check.reason ? `: ${check.reason}` : ""}); is your key in quality/allowed-signers on main?`);
  }
  pushApproval({ tag, sha, run: sh });
  console.log(`Pushed ${tag}, signed by ${check.signer}.`);
  // The green check is evidence, not proof (an author who can push branches can fake it through a base branch, see
  // .github/workflows/human-approval.yml); main's verifier run here, from this clean clone, is the proof.
  console.log(
    `Before merging, from this clean clone of main:\n  git fetch -q origin main +refs/pull/${pr}/head:refs/remotes/pr/${pr} "+refs/tags/approve/*:refs/tags/approve/*"\n` +
      `  node scripts/signed-approval.mjs origin/main ${sha} --ci\nIt must print ✅ PASS for the commit you are about to merge (the pull request's head).`,
  );
  try {
    rerun(pr, sha);
  } catch (error) {
    // The approval is done; only the re-run failed, so say so instead of failing the whole command.
    console.log(`Approved, but the checks could not be re-run (${error.message}): re-run them from the pull request's Checks tab.`);
  }
}

// Re-run the latest human-approval run for this pull request and the pr-evidence job of the latest CI run on its head.
function rerun(pr, sha) {
  const runs = (query) => JSON.parse(sh("gh", ["api", `repos/{owner}/{repo}/actions/runs?${query}&per_page=50`])).workflow_runs ?? [];
  const approval = approvalRun(runs("event=pull_request_target"), pr);
  const ci = ciRun(runs(`event=pull_request&head_sha=${sha}`), sha);
  if (approval) {
    sh("gh", ["run", "rerun", String(approval.id)]);
    console.log(`Re-running human-approval: ${approval.html_url}`);
  } else console.log("No human-approval run found for this pull request: re-run it from the pull request's Checks tab.");
  const job = ci && evidenceJob(JSON.parse(sh("gh", ["api", `repos/{owner}/{repo}/actions/runs/${ci.id}/jobs`])).jobs);
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
