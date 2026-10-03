#!/usr/bin/env node
// Claude Code PreToolUse hook (matcher: Read|Edit|Write|NotebookEdit|Grep).
// Blocks reading or writing secrets files (.env, .env.local, .env.production ...); .env.example stays open.
//   Read/Edit/Write/NotebookEdit: the file path.
//   Grep: the path, and a glob that can match a secrets file. A glob makes ripgrep search files .gitignore hides,
//   and the permissions.deny rules only check the directory Grep searches, not the files the glob lets in.
//   Glob is not matched on purpose: it returns names, never contents.
// Exit code 2 = the tool call is BLOCKED and stderr is fed back to the agent as the reason.
// PreToolUse hooks run BEFORE the permission check, in EVERY permission mode (even bypassPermissions):
// hooks enforce, AGENTS.md only advises. The permissions.deny rules in settings.json are the second line of defence.
let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let ev = {};
try {
  ev = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

const block = (reason) => {
  process.stderr.write(`Blocked by hook: ${reason} Use .env.example instead and ask the user to update .env manually.\n`);
  process.exit(2);
};
const isSecret = (name) => /^\.env(\..+)?$/.test(name) && name !== ".env.example";
const baseName = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? "";

// Common dotenv names to test a glob against.
const SAMPLES = [".env", ".env.local", ".env.development", ".env.production", ".env.test", ".env.staging"];
SAMPLES.push(...SAMPLES.slice(2).map((name) => `${name}.local`));

// Expand {a,b} braces, innermost first, so every alternative is a plain glob.
const expandBraces = (glob) => {
  const m = /\{([^{}]*)\}/.exec(glob);
  if (!m) return [glob];
  return m[1].split(",").flatMap((alt) => expandBraces(glob.slice(0, m.index) + alt + glob.slice(m.index + m[0].length)));
};
// One path segment of a glob as a RegExp: * and ? stay inside the segment, [!x] negates, \x is literal.
const segmentRegExp = (segment) =>
  new RegExp(
    "^" +
      segment.replace(/\\(.)|(\*+)|(\?)|\[(!?)([^\]]*)\]|([.+^$(){}|[\]\\])/g, (_, esc, star, q, neg, cls, special) => {
        if (esc !== undefined) return esc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (star) return "[^/]*";
        if (q) return "[^/]";
        if (cls !== undefined) return `[${neg ? "^" : ""}${cls.replace(/\\/g, "\\\\")}]`;
        return `\\${special}`;
      }) +
      "$",
  );
// Can this glob match a secrets file? Only its last segment matters: we assume the directories exist.
// The concrete instance (wildcards dropped) catches names outside SAMPLES, such as `.env.q*` for `.env.qa`.
const globHitsSecret = (glob) =>
  expandBraces(glob).some((alt) => {
    const segment = alt.replace(/\/+$/, "").split("/").pop();
    const instance = segment.replace(/\\(.)/g, "$1").replace(/\[!?([^\]]?)[^\]]*\]/g, "$1").replace(/[*?]/g, "");
    try {
      const re = segmentRegExp(segment);
      return isSecret(instance) || SAMPLES.some((name) => re.test(name));
    } catch {
      return true;
    }
  });

const input = ev.tool_input ?? {};

if (ev.tool_name === "Grep") {
  if (input.path && isSecret(baseName(input.path))) block(`${input.path} is a secrets file; the agent must not search it.`);
  // Claude passes the glob to ripgrep; split it the widest way (spaces and top-level commas) and skip !negations,
  // which can only exclude files.
  const globs = String(input.glob ?? "")
    .split(/\s+/)
    .flatMap((piece) => expandBraces(`{${piece}}`))
    .filter((glob) => glob && !glob.startsWith("!"));
  const hit = globs.find(globHitsSecret);
  if (hit !== undefined) {
    block(`the Grep glob "${input.glob}" can match .env files ("${hit}"), and a glob makes ripgrep search files .gitignore hides. Drop the glob or narrow it to file types such as *.ts.`);
  }
  process.exit(0);
}

const p = String(input.file_path ?? input.notebook_path ?? "").replace(/\\/g, "/");
if (isSecret(baseName(p))) {
  const verb = ev.tool_name === "Read" ? "read" : "edit";
  block(`${p} is a secrets file; the agent must not ${verb} it.`);
}
process.exit(0);
