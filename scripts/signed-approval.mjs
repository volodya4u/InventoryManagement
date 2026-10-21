// Signed human approval of a pull request: the trusted channel of ADR-0005 (slice 3, step B). The agent shares the
// owner's GitHub identity and git config, so nothing it can write proves the owner approved. What it cannot do is sign
// with the owner's hardware key, which needs a physical touch. The owner approves the head commit of a pull request by
// pushing an annotated tag `approve/<head-sha>`, signed with that key (`node scripts/approve-pr.mjs <pr>`).
// scripts/pr-evidence.mjs then checks:
//   - the tag is annotated and points at the head commit, so an approval of another commit cannot be replayed;
//   - `git verify-tag` accepts its signature against the allowed signers in quality/allowed-signers as the BASE has it,
//     so a branch cannot list its own key;
//   - only hardware-backed key types (sk-…) count.
// No usable key on the base means signed approval is not set up yet (N/A); a branch adding the first key is how it
// starts.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SIGNERS_PATH = "quality/allowed-signers";
export const HARDWARE_KEY_TYPES = ["sk-ssh-ed25519@openssh.com", "sk-ecdsa-sha2-nistp256@openssh.com"];
const KEY_TYPE = /^(sk-)?(ssh-[\w-]+|ecdsa-sha2-[\w-]+)(@openssh\.com)?$/;

// The key type a public key blob names in itself: an SSH key is a length-prefixed type string, then the key.
function blobType(blob) {
  try {
    const bytes = Buffer.from(blob, "base64");
    const length = bytes.readUInt32BE(0);
    return length > 0 && length < 64 ? bytes.subarray(4, 4 + length).toString("latin1") : null;
  } catch {
    return null;
  }
}

// Why a line of an allowed-signers file does not count, or null when it does. The fields are read by position, the way
// ssh-keygen reads them: `principals [options] keytype key [comment]`. A principal can be any string, so a principal
// named after a hardware key type proves nothing; the type is the field before the key, and it must match the type the
// key blob itself carries. Certificate authorities and keys that sign without a touch are refused.
function rejection(tokens, keyTypes) {
  const [principals, ...rest] = tokens;
  const options = rest[0] && !KEY_TYPE.test(rest[0]) ? rest[0] : "";
  const [type, blob] = options ? rest.slice(1) : rest;
  if (!principals || !type || !blob || !KEY_TYPE.test(type)) return "no key type found";
  // OpenSSH matches option names without regard to case, so the refusals do too.
  if (/(^|,)cert-authority(,|$)/i.test(options)) return "a cert-authority line is not accepted";
  if (/(^|,)no-touch-required(,|$)/i.test(options)) return "no-touch-required lets the key sign without a touch";
  if (!keyTypes.includes(type)) return `${type} is not a hardware-backed key type`;
  const own = blobType(blob);
  if (own !== type) return `the key is ${own ?? "unreadable"}, not the ${type} the line names`;
  return null;
}

// The lines of an allowed-signers file (git's gpg.ssh.allowedSignersFile) whose key counts; the others are ignored,
// with the reason.
export function allowedSigners(text, keyTypes = HARDWARE_KEY_TYPES) {
  const lines = [];
  const ignored = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    // Options such as namespaces="git" may hold spaces inside quotes, so split on spaces outside quotes.
    const reason = rejection(line.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [], keyTypes);
    if (reason) ignored.push({ line, reason });
    else lines.push(line);
  }
  return { lines, ignored };
}

const run = (root, args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
const out = (root, args) => {
  const r = run(root, args);
  return r.status === 0 ? r.stdout.trim() : null;
};

// The approval of `head` in the repository at root, judged against the base's allowed signers:
//   { state: "unset" }                               no usable key on the base
//   { state: "missing", tag }                        no approve/<head-sha> tag
//   { state: "invalid", tag, reason }                a tag that does not prove an approval of this commit
//   { state: "valid", tag, signer }                  signed by an allowed signer, on the head commit
// `ignored` lists the base's key lines that do not count.
export function signedApproval(root, { base, head, keyTypes = HARDWARE_KEY_TYPES }) {
  const file = out(root, ["show", `${base}:${SIGNERS_PATH}`]);
  const { lines, ignored } = allowedSigners(file ?? "", keyTypes);
  if (!lines.length) return { state: "unset", ignored };
  const sha = execFileSync("git", ["-C", root, "rev-parse", "--verify", `${head}^{commit}`], { encoding: "utf8" }).trim();
  const tag = `approve/${sha}`;
  const ref = `refs/tags/${tag}`;
  if (out(root, ["rev-parse", "-q", "--verify", ref]) === null) return { state: "missing", tag, ignored };
  if (out(root, ["cat-file", "-t", ref]) !== "tag") return { state: "invalid", tag, reason: "a lightweight tag carries no signature", ignored };
  const target = out(root, ["rev-parse", `${ref}^{commit}`]);
  if (target !== sha) return { state: "invalid", tag, reason: `it points at ${String(target).slice(0, 12)}, not at the head commit`, ignored };
  const dir = mkdtempSync(join(tmpdir(), "allowed-signers-"));
  try {
    const signers = join(dir, "allowed_signers");
    writeFileSync(signers, `${lines.join("\n")}\n`);
    // minTrustLevel=fully: git itself refuses a good signature by a key the file does not list (trust "undefined"),
    // a second line of defence behind the principal check below. gpg.ssh.program is pinned as approve-pr.mjs pins it
    // for signing: a -c setting beats every config file, so a repository-local program cannot print a good signature.
    const verify = ["-c", "gpg.format=ssh", "-c", "gpg.ssh.program=ssh-keygen", "-c", `gpg.ssh.allowedSignersFile=${signers}`, "-c", "gpg.minTrustLevel=fully"];
    const r = run(root, [...verify, "verify-tag", ref]);
    const said = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const signer = /Good "git" signature for (\S+)/.exec(said)?.[1];
    if (r.status !== 0 || !signer) {
      const why = said.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? `git verify-tag exited ${r.status}`;
      return { state: "invalid", tag, reason: why.slice(0, 200), ignored };
    }
    return { state: "valid", tag, signer, ignored };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The Human approval gate, a row of its own next to Review so a human approval never reads as an automated pass. In CI
// (ci) a missing approval fails; locally it is N/A, since the owner signs after the pull request is open. A tag that
// does not prove an approval fails everywhere.
export function humanApprovalGate(result, { ci }) {
  const keys = result.ignored?.length ? ` (${result.ignored.length} key line(s) on the base ignored: not hardware-backed)` : "";
  if (result.state === "unset") {
    return { applies: false, problems: [], detail: `signed approval is not set up: ${SIGNERS_PATH} on the base lists no hardware-backed key${keys}` };
  }
  if (result.state === "valid") return { applies: true, problems: [], detail: `${result.tag} signed by ${result.signer}${keys}` };
  if (result.state === "invalid") return { applies: true, problems: [`${result.tag} is not a valid signed approval: ${result.reason}.`], detail: "" };
  const how = "after reading the pull request and the review, the owner runs `node scripts/approve-pr.mjs <pr>` (it signs with the hardware key and re-runs this job)";
  return ci
    ? { applies: true, problems: [`No signed approval of the head commit (${result.tag}): ${how}.`], detail: "" }
    : { applies: false, problems: [], detail: `checked in CI: ${how}` };
}

// The command line, run by .github/workflows/human-approval.yml from main's checkout (base = HEAD there) and usable
// locally: node scripts/signed-approval.mjs <base-ref> <head-ref> [--ci]. It prints the gate's row in the pr-evidence
// table format and exits 1 when the row fails, 2 on bad arguments.
export function cli(args, { root = process.cwd(), keyTypes, log = console.log } = {}) {
  const ci = args.includes("--ci");
  const [base, head] = args.filter((a) => a !== "--ci");
  if (!base || !head) {
    log("Usage: node scripts/signed-approval.mjs <base-ref> <head-ref> [--ci]");
    return 2;
  }
  const gate = humanApprovalGate(signedApproval(root, { base, head, ...(keyTypes ? { keyTypes } : {}) }), { ci });
  const cell = gate.problems.length ? `❌ FAIL: ${gate.problems.join(" ")}` : `${gate.applies ? "✅ PASS" : "➖ N/A"}: ${gate.detail}`;
  log(["## Human approval", "", "| Gate | Result |", "| --- | --- |", `| Human approval | ${cell.replace(/\|/g, "\\|")} |`].join("\n"));
  return gate.problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(cli(process.argv.slice(2)));
