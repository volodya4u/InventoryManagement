// Unit tests for the decisions in scripts/approve-pr.mjs. Run: node --test scripts/approve-pr.test.mjs
// The script itself signs with the owner's hardware key and pushes to origin, so it is never run here: the push goes
// through a fake command runner, and the drift guard and the run selection are pure functions over what git and the
// GitHub API return.
import assert from "node:assert/strict";
import { test } from "node:test";
import { APPROVAL_TOOLS, approvalRun, ciRun, driftProblem, evidenceJob, pushApproval, signingProgram } from "./approve-pr.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const TAG = `approve/${SHA}`;

// A command runner that answers each git subcommand from `answers` (a string, or an Error to throw) and records calls.
function runner(answers) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    const answer = answers[args[0]];
    if (answer instanceof Error) throw answer;
    return answer ?? "";
  };
  return { calls, run };
}
// What execFileSync throws when a command fails.
const failed = (cmd, stderr, status = 128) => Object.assign(new Error(`Command failed: ${cmd}\n${stderr}`), { status, stderr });

test("an approval tag already on origin is not pushed: the local tag is deleted and the message says so", () => {
  const { calls, run } = runner({ "ls-remote": `1111111111111111111111111111111111111111\trefs/tags/${TAG}\n${SHA}\trefs/tags/${TAG}^{}` });
  assert.throws(
    () => pushApproval({ tag: TAG, sha: SHA, run }),
    (error) => {
      assert.match(error.message, new RegExp(`${TAG} is already on origin`));
      assert.match(error.message, new RegExp(`node scripts/signed-approval\\.mjs origin/main ${SHA} --ci`), "says how to check the existing tag");
      assert.doesNotMatch(error.message, /Command failed/);
      return true;
    },
  );
  assert.deepEqual(calls, [`git ls-remote --tags origin refs/tags/${TAG}`, `git tag -d ${TAG}`]);

  // ls-remote matches a pattern against the end of each ref: a ref that only ends in the tag name is another tag.
  const other = runner({ "ls-remote": `1111111111111111111111111111111111111111\trefs/tags/old/${TAG}` });
  pushApproval({ tag: TAG, sha: SHA, run: other.run });
  assert.deepEqual(other.calls, [`git ls-remote --tags origin refs/tags/${TAG}`, `git push origin refs/tags/${TAG}:refs/tags/${TAG}`]);
});

test("when origin cannot be read or the push fails, the local tag is deleted and the message names the step", () => {
  const offline = runner({ "ls-remote": failed("git ls-remote", "fatal: unable to access 'https://github.com/x/y/': Could not resolve host") });
  assert.throws(() => pushApproval({ tag: TAG, sha: SHA, run: offline.run }), (error) => {
    assert.match(error.message, /could not read the tags on origin/);
    assert.match(error.message, /Could not resolve host/);
    assert.doesNotMatch(error.message, /Command failed/);
    return true;
  });
  assert.deepEqual(offline.calls, [`git ls-remote --tags origin refs/tags/${TAG}`, `git tag -d ${TAG}`]);

  const rejected = runner({ push: failed("git push", "", 1) });
  assert.throws(() => pushApproval({ tag: TAG, sha: SHA, run: rejected.run }), (error) => {
    assert.match(error.message, new RegExp(`the push of ${TAG} failed \\(git exited 1\\)`));
    assert.doesNotMatch(error.message, /Command failed/);
    return true;
  });
  assert.deepEqual(rejected.calls, [`git ls-remote --tags origin refs/tags/${TAG}`, `git push origin refs/tags/${TAG}:refs/tags/${TAG}`, `git tag -d ${TAG}`]);

  // The ordinary case: the tag is not on origin, so the one tag is pushed and kept.
  const fresh = runner({});
  pushApproval({ tag: TAG, sha: SHA, run: fresh.run });
  assert.deepEqual(fresh.calls, [`git ls-remote --tags origin refs/tags/${TAG}`, `git push origin refs/tags/${TAG}:refs/tags/${TAG}`]);
});

test("the drift guard refuses when the script or its verifier differs from origin/main, or the comparison fails", () => {
  assert.deepEqual(APPROVAL_TOOLS, ["scripts/approve-pr.mjs", "scripts/signed-approval.mjs"]);
  assert.equal(driftProblem({ status: 0, stdout: "" }), null);
  assert.equal(driftProblem({ status: 0, stdout: "\n" }), null);
  assert.match(driftProblem({ status: 0, stdout: "scripts/approve-pr.mjs\n" }), /scripts\/approve-pr\.mjs differs from origin\/main here: run this from a clean checkout of main/);
  assert.match(driftProblem({ status: 0, stdout: "scripts/signed-approval.mjs\r\n" }), /^scripts\/signed-approval\.mjs differs/);
  assert.match(driftProblem({ status: 0, stdout: "scripts/approve-pr.mjs\nscripts/signed-approval.mjs\n" }), /scripts\/approve-pr\.mjs and scripts\/signed-approval\.mjs differ from origin\/main/);
  // A failed comparison (no origin/main, or git not found) is never read as "no difference".
  assert.match(driftProblem({ status: 128, stdout: "", stderr: "fatal: bad revision 'origin/main'\n" }), /could not compare .* with origin\/main: fatal: bad revision 'origin\/main'/);
  assert.match(driftProblem({ status: null, stdout: "", error: new Error("spawnSync git ENOENT") }), /could not compare .*ENOENT/);
});

test("run selection picks the latest human-approval run of the pull request and the pr-evidence job of the latest CI run on the head", () => {
  const run = (id, path, created, extra = {}) => ({ id, path: `.github/workflows/${path}`, created_at: created, html_url: `https://example.test/runs/${id}`, ...extra });
  const pr = (...numbers) => ({ pull_requests: numbers.map((number) => ({ number })) });
  const approvals = [
    run(1, "human-approval.yml", "2026-10-21T10:00:00Z", pr(100)),
    run(2, "human-approval.yml", "2026-10-21T12:00:00Z", pr(101)),
    run(3, "not-human-approval.yml", "2026-10-21T13:00:00Z", pr(100)),
    run(4, "human-approval.yml", "2026-10-21T11:00:00Z", pr(100)),
  ];
  assert.equal(approvalRun(approvals, "100")?.id, 4, "the newest run of this pull request, whatever the API's order");
  assert.equal(approvalRun(approvals, 101)?.id, 2);
  assert.equal(approvalRun(approvals, "102"), undefined);
  assert.equal(approvalRun([], "100"), undefined);

  const other = "fedcba9876543210fedcba9876543210fedcba98";
  const ci = [
    run(10, "ci.yml", "2026-10-21T10:00:00Z", { head_sha: SHA }),
    run(11, "ci.yml", "2026-10-21T12:00:00Z", { head_sha: other }),
    run(12, "factory-gates.yml", "2026-10-21T13:00:00Z", { head_sha: SHA }),
    run(13, "ci.yml", "2026-10-21T11:00:00Z", { head_sha: SHA }),
  ];
  assert.equal(ciRun(ci, SHA)?.id, 13);
  assert.equal(ciRun(ci, "0000000000000000000000000000000000000000"), undefined);

  const jobs = [{ id: 7, name: "build-and-test" }, { id: 8, name: "pr-evidence" }, { id: 9, name: "pr-evidence-extra" }];
  assert.equal(evidenceJob(jobs)?.id, 8);
  assert.equal(evidenceJob([{ id: 7, name: "build-and-test" }]), undefined);
  assert.equal(evidenceJob(undefined), undefined);
});

test("the signing program is an absolute gpg.ssh.program from the global config, else plain ssh-keygen", () => {
  // Windows' own OpenSSH talks to a FIDO2 key where Git for Windows' bundled ssh-keygen may not, so the owner can name it.
  assert.equal(signingProgram("C:/Windows/System32/OpenSSH/ssh-keygen.exe"), "C:/Windows/System32/OpenSSH/ssh-keygen.exe");
  assert.equal(signingProgram(String.raw`C:\Windows\System32\OpenSSH\ssh-keygen.exe` + "\n"), String.raw`C:\Windows\System32\OpenSSH\ssh-keygen.exe`);
  assert.equal(signingProgram("/usr/bin/ssh-keygen"), "/usr/bin/ssh-keygen");
  // No global setting, or one that is not an absolute path, falls back to ssh-keygen on PATH.
  for (const value of [undefined, null, "", "  \n", "ssh-keygen", "tools/ssh-keygen", String.raw`.\ssh-keygen.exe`, String.raw`\\server\share\ssh-keygen.exe`, "//server/share/ssh-keygen.exe", "C:ssh-keygen.exe"]) {
    assert.equal(signingProgram(value), "ssh-keygen", JSON.stringify(value));
  }
});
