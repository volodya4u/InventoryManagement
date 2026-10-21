// Unit tests for scripts/signed-approval.mjs. Run: node --test scripts/signed-approval.test.mjs
// Each case builds a throwaway repository and a throwaway, unencrypted ed25519 key under the OS temp folder (the test
// cannot touch a hardware key), so the key type policy is passed in; the hardware-only default has its own case.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { HARDWARE_KEY_TYPES, SIGNERS_PATH, allowedSigners, cli, humanApprovalGate, signedApproval } from "./signed-approval.mjs";

const tmp = mkdtempSync(join(tmpdir(), "signed-approval-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const TEST_KEYS = ["ssh-ed25519"];
const ID = ["-c", "user.email=owner@example.com", "-c", "user.name=Owner"];
const git = (root, ...args) => execFileSync("git", ["-C", root, ...ID, ...args], { encoding: "utf8" }).trim();
const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

function key(name) {
  const path = join(tmp, name);
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", name, "-f", path]);
  return { path, pub: readFileSync(`${path}.pub`, "utf8").trim() };
}
const owner = key("owner");
const stranger = key("stranger");
const signerLine = (email, k) => `${email} namespaces="git" ${k.pub}\n`;

// A repository whose main lists the owner's key, and a branch with one commit on it.
let n = 0;
function repo({ signers = signerLine("owner@example.com", owner) } = {}) {
  const root = join(tmp, `repo-${++n}`);
  mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  write(root, "README.md", "x\n");
  if (signers !== null) write(root, SIGNERS_PATH, signers);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  git(root, "switch", "-q", "-c", "claude/x");
  write(root, "a.txt", "a\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "work");
  return { root, head: git(root, "rev-parse", "HEAD") };
}
const sign = (root, sha, k, name = `approve/${sha}`) =>
  git(root, "-c", "gpg.format=ssh", "-c", `user.signingkey=${k.path}`, "tag", "-s", "-m", `Approve ${sha}`, name, sha);
const check = (root, opts = {}) => signedApproval(root, { base: "main", head: "HEAD", keyTypes: TEST_KEYS, ...opts });

test("a tag signed by an allowed signer on the head commit is valid and names the signer", () => {
  const { root, head } = repo();
  sign(root, head, owner);
  const result = check(root);
  assert.equal(result.state, "valid", result.reason);
  assert.equal(result.signer, "owner@example.com");
  assert.equal(result.tag, `approve/${head}`);
});

test("an unknown key, an unsigned tag, a lightweight tag or a tag on another commit is not valid", () => {
  const unknown = repo();
  sign(unknown.root, unknown.head, stranger);
  assert.equal(check(unknown.root).state, "invalid");

  const unsigned = repo();
  git(unsigned.root, "tag", "-a", "-m", "looks fine", `approve/${unsigned.head}`, unsigned.head);
  assert.equal(check(unsigned.root).state, "invalid");

  const lightweight = repo();
  git(lightweight.root, "tag", `approve/${lightweight.head}`, lightweight.head);
  assert.match(check(lightweight.root).reason, /lightweight/);

  // A replay: a signed approval of the base commit, renamed for the head, still points at the base commit.
  const replay = repo();
  sign(replay.root, git(replay.root, "rev-parse", "main"), owner, `approve/${replay.head}`);
  const result = check(replay.root);
  assert.equal(result.state, "invalid");
  assert.match(result.reason, /points at/);

  // No tag at all is missing, not invalid.
  assert.equal(check(repo().root).state, "missing");
});

test("the allowed signers come from the base ref, not the branch, and only hardware-backed key types count", () => {
  // The branch adds a stranger's key to its own copy of the file: the check reads main's copy, so it does not count.
  const { root, head } = repo();
  write(root, SIGNERS_PATH, signerLine("owner@example.com", owner) + signerLine("agent@example.com", stranger));
  git(root, "commit", "-qam", "add a key on the branch");
  const branchHead = git(root, "rev-parse", "HEAD");
  sign(root, branchHead, stranger);
  assert.equal(check(root).state, "invalid");
  assert.notEqual(head, branchHead);

  // No file on the base, or no usable key in it: signed approval is not set up.
  assert.equal(check(repo({ signers: null }).root).state, "unset");
  assert.equal(check(repo({ signers: "# no keys yet\n" }).root).state, "unset");

  // The default policy keeps hardware-backed keys only.
  assert.deepEqual(HARDWARE_KEY_TYPES, ["sk-ssh-ed25519@openssh.com", "sk-ecdsa-sha2-nistp256@openssh.com"]);
  const parsed = allowedSigners(
    [
      "# owner's keys",
      'owner@example.com namespaces="git" sk-ssh-ed25519@openssh.com AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29t owner-yubikey',
      'owner@example.com namespaces="git" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOwner laptop',
      "",
    ].join("\n"),
  );
  assert.equal(parsed.lines.length, 1);
  assert.match(parsed.lines[0], /sk-ssh-ed25519@openssh\.com/);
  assert.deepEqual(parsed.ignored.map((i) => i.reason), ["ssh-ed25519 is not a hardware-backed key type"]);
  // With the hardware-only default, the test repository's software key does not count.
  assert.equal(signedApproval(repo().root, { base: "main", head: "HEAD" }).state, "unset");

  // The key type is the field before the key, not any token that looks like one: a principal named after a hardware
  // type does not turn a software key into a hardware one (the bypass both reviews of this slice found).
  const sk = "AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29tAAAAIGJsb2I=";
  const [, softBlob] = owner.pub.split(" ");
  const tricks = allowedSigners(
    [
      `sk-ssh-ed25519@openssh.com namespaces="git" ssh-ed25519 ${softBlob}`,
      `sk-ssh-ed25519@openssh.com ssh-ed25519 ${softBlob}`,
      `owner@example.com namespaces="git" sk-ssh-ed25519@openssh.com ${softBlob}`,
      `owner@example.com cert-authority,namespaces="git" sk-ssh-ed25519@openssh.com ${sk}`,
      `owner@example.com no-touch-required,namespaces="git" sk-ssh-ed25519@openssh.com ${sk}`,
      // OpenSSH matches option names without regard to case.
      `owner@example.com Cert-Authority,namespaces="git" sk-ssh-ed25519@openssh.com ${sk}`,
      `owner@example.com namespaces="git",NO-TOUCH-REQUIRED sk-ssh-ed25519@openssh.com ${sk}`,
      `ssh-admin@example.com namespaces="git" sk-ssh-ed25519@openssh.com ${sk} a principal that starts like a type`,
    ].join("\n"),
  );
  assert.deepEqual(tricks.lines, [`ssh-admin@example.com namespaces="git" sk-ssh-ed25519@openssh.com ${sk} a principal that starts like a type`]);
  assert.deepEqual(
    tricks.ignored.map((i) => i.reason),
    [
      "ssh-ed25519 is not a hardware-backed key type",
      "ssh-ed25519 is not a hardware-backed key type",
      "the key is ssh-ed25519, not the sk-ssh-ed25519@openssh.com the line names",
      "a cert-authority line is not accepted",
      "no-touch-required lets the key sign without a touch",
      "a cert-authority line is not accepted",
      "no-touch-required lets the key sign without a touch",
    ],
  );
  // The same software-key line, end to end: a signature with that key is not an approval.
  const crafted = repo({ signers: `sk-ssh-ed25519@openssh.com namespaces="git" ${owner.pub}\n` });
  sign(crafted.root, crafted.head, owner);
  assert.equal(signedApproval(crafted.root, { base: "main", head: "HEAD" }).state, "unset");
});

test("human approval: in CI a missing signature fails, locally it is N/A, a bad tag fails in both, and an unset signers file is N/A", () => {
  const missing = { state: "missing", tag: "approve/abc", ignored: [] };
  assert.equal(humanApprovalGate(missing, { ci: true }).problems.length, 1);
  assert.match(humanApprovalGate(missing, { ci: true }).problems[0], /node scripts\/approve-pr\.mjs/);
  assert.deepEqual(humanApprovalGate(missing, { ci: false }), { applies: false, problems: [], detail: humanApprovalGate(missing, { ci: false }).detail });
  assert.match(humanApprovalGate(missing, { ci: false }).detail, /checked in CI/);
  for (const ci of [true, false]) {
    const bad = humanApprovalGate({ state: "invalid", tag: "approve/abc", reason: "no signature found", ignored: [] }, { ci });
    assert.match(bad.problems.join(" "), /approve\/abc is not a valid signed approval: no signature found/);
    const unset = humanApprovalGate({ state: "unset", ignored: [] }, { ci });
    assert.deepEqual([unset.applies, unset.problems], [false, []]);
    assert.match(unset.detail, /not set up/);
  }
  const valid = humanApprovalGate({ state: "valid", tag: "approve/abc", signer: "owner@example.com", ignored: [] }, { ci: true });
  assert.deepEqual([valid.applies, valid.problems], [true, []]);
  assert.match(valid.detail, /approve\/abc signed by owner@example\.com/);
});

test("the command line exits 1 in CI without a valid approval, and 0 with one or when signing is not set up", () => {
  const run = (root, args) => {
    const printed = [];
    const code = cli(args, { root, keyTypes: TEST_KEYS, log: (line) => printed.push(line) });
    return { code, text: printed.join("\n") };
  };
  const { root, head } = repo();
  const missing = run(root, ["main", "HEAD", "--ci"]);
  assert.equal(missing.code, 1);
  assert.match(missing.text, /\| Human approval \| ❌ FAIL: No signed approval of the head commit/);
  assert.equal(run(root, ["main", "HEAD"]).code, 0, "locally a missing approval is N/A");
  sign(root, head, owner);
  const valid = run(root, ["main", head, "--ci"]);
  assert.equal(valid.code, 0, valid.text);
  assert.match(valid.text, /\| Human approval \| ✅ PASS: approve\/[0-9a-f]{40} signed by owner@example\.com/);
  const unset = run(repo({ signers: null }).root, ["main", "HEAD", "--ci"]);
  assert.equal(unset.code, 0);
  assert.match(unset.text, /➖ N\/A: signed approval is not set up/);
  assert.equal(run(root, []).code, 2, "usage");
});
