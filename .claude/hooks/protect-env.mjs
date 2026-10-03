#!/usr/bin/env node
// Claude Code PreToolUse hook (matcher: Read|Edit|Write|NotebookEdit|Grep|Bash).
// Blocks reading or writing secrets files (.env, .env.local, .env.production ...); .env.example stays open.
//   Read/Edit/Write/NotebookEdit: the file path.
//   Grep: the path, and a glob that can match a secrets file. A glob makes ripgrep search files .gitignore hides,
//   and the permissions.deny rules only check the directory Grep searches, not the files the glob lets in.
//   Bash: routes that read a secrets file without naming it, which the deny rules cannot see: shell globs and braces
//   that expand to one (.e*, .en?, {.env,x}), git diff --no-index or a path outside the work tree (git then diffs
//   as with --no-index), git grep --no-index / --no-exclude-standard, recursive diff, and recursive grep unless every
//   --include glob keeps .env out. A .env named
//   outright is left to the deny rules, so commit messages may mention it.
//   Glob is not matched on purpose: it returns names, never contents.
// Text checks are not a sandbox: sh -c, variables or a script that opens the file itself still get through, native
// Windows has no Claude Code sandbox, and the PowerShell tool is not covered.
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
// Case-insensitive: Windows opens .env for .ENV or .Env.Local.
const isSecret = (name) => /^\.env(\..+)?$/i.test(name) && name.toLowerCase() !== ".env.example";
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
// ripgrep globs follow .gitignore rules, where * matches a leading dot; in the shell (`shell`) it never does.
const globHitsSecret = (glob, shell = false) =>
  expandBraces(glob).some((alt) => {
    const segment = alt.replace(/\/+$/, "").split("/").pop();
    if (shell && /^[*?]/.test(segment)) return false;
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
  const hit = globs.find((glob) => globHitsSecret(glob));
  if (hit !== undefined) {
    block(`the Grep glob "${input.glob}" can match .env files ("${hit}"), and a glob makes ripgrep search files .gitignore hides. Drop the glob or narrow it to file types such as *.ts.`);
  }
  process.exit(0);
}

// Words of each subcommand. A quoted character is \-escaped, so only unquoted globs and braces stay special.
const subcommands = (cmd) => {
  const subs = [[]];
  let word = "";
  let inWord = false;
  let quote = "";
  const endWord = () => {
    if (inWord) subs.at(-1).push(word);
    word = "";
    inWord = false;
  };
  for (const c of cmd) {
    if (quote) {
      if (c === quote) quote = "";
      else word += /[*?[\]{}\\]/.test(c) ? `\\${c}` : c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (/[;&|()\n]/.test(c)) {
      endWord();
      subs.push([]);
    } else if (/[\s<>]/.test(c)) {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endWord();
  return subs.filter((words) => words.length);
};
const unescape = (word) => word.replace(/\\(.)/g, "$1");
// Git may accept an unambiguous abbreviation of a long option (--no-ind), so match every prefix.
const optionPrefix = (arg, options) => /^--./.test(arg) && options.some((option) => option.startsWith(arg.split("=")[0]));
// Same normalization as log-action.mjs: Windows (`D:\x`), Git Bash (`/d/x`) and mixed paths compare as `D:/x`.
const norm = (p) => {
  const n = String(p)
    .replace(/\\/g, "/")
    .replace(/^\/([a-zA-Z])\//, (_, d) => `${d.toUpperCase()}:/`)
    .replace(/^([a-zA-Z]):\//, (_, d) => `${d.toUpperCase()}:/`)
    .replace(/\/$/, "");
  return process.platform === "win32" ? n.toLowerCase() : n;
};
const root = norm(ev.cwd ?? process.cwd());
// A path that may leave the project: any `..` segment, `~`, or an absolute path (/dev/null too) outside the cwd.
const outsideWorkTree = (arg) =>
  arg.split(/[\\/]/).includes("..") || /^~/.test(arg) || (/^(\/|[A-Za-z]:[\\/])/.test(arg) && !`${norm(arg)}/`.startsWith(`${root}/`));
const recursive = (arg, i, args) =>
  /^-[^-]*[rR]/.test(arg) || /^--(dereference-)?recursive$/.test(arg) || arg === "--directories=recurse" || (arg === "-d" && args[i + 1] === "recurse");
// grep --include=GLOB reads only files whose name matches GLOB (and its * matches a leading dot, like ripgrep's).
const safeIncludes = (args) => {
  const globs = args.flatMap((arg, i) => (arg.startsWith("--include=") ? [arg.slice(10)] : arg === "--include" ? [args[i + 1] ?? "*"] : []));
  return globs.length > 0 && !globs.some((glob) => globHitsSecret(glob));
};

if (ev.tool_name === "Bash") {
  // Heredoc bodies are data (commit messages), not words the shell expands.
  const cmd = String(input.command ?? "").replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n(?:[\s\S]*?\n)?[ \t]*\2[ \t]*(?=\n|$)/g, " $3");
  let leftProject = false;
  for (const words of subcommands(cmd)) {
    const glob = words.find((word) => /(^|[^\\])[*?[{]/.test(word) && globHitsSecret(word, true));
    if (glob !== undefined) block(`the shell pattern ${unescape(glob)} can expand to a .env file.`);
    const args = words.map(unescape);
    // Outside any repository, git diff of two paths runs as --no-index.
    if (/^(cd|pushd)$/.test(args[0])) leftProject ||= args.length < 2 || args[1] === "-" || outsideWorkTree(args[1]);
    // The first program word, so wrappers such as nice, timeout 30 or xargs are covered too.
    const at = args.findIndex((word) => /^(git|[ef]?grep|rgrep|diff)(\.exe)?$/.test(baseName(word)));
    if (at < 0) continue;
    const program = baseName(args[at]).replace(/\.exe$/, "");
    const rest = args.slice(at + 1);
    if (program === "git") {
      let i = 0;
      while (i < rest.length && rest[i].startsWith("-")) i += /^(-[Cc]|--(git-dir|work-tree|namespace|config-env))$/.test(rest[i]) ? 2 : 1;
      const [sub, ...subArgs] = rest.slice(i);
      if (sub === "diff" && subArgs.some((arg) => optionPrefix(arg, ["--no-index"]))) {
        block("git diff --no-index compares files outside git's index, so it prints .gitignore'd files such as .env.");
      }
      if (sub === "diff" && (leftProject || subArgs.some(outsideWorkTree))) {
        block("git diff treats a path outside the work tree as --no-index, which prints .gitignore'd files such as .env. Use paths inside the project.");
      }
      if (sub === "grep" && subArgs.some((arg) => optionPrefix(arg, ["--no-index", "--no-exclude-standard"]))) {
        block("git grep --no-index and --no-exclude-standard search .gitignore'd files such as .env; plain git grep searches tracked files.");
      }
    } else if (program !== "diff" && (program === "rgrep" || rest.some(recursive)) && !safeIncludes(rest)) {
      block("recursive grep reads every file, .env included. Use the Grep tool (it skips .gitignore'd files) or limit grep with --include=*.ts.");
    } else if (program === "diff" && rest.some(recursive)) {
      block("recursive diff prints every file, .env included. Use git diff.");
    }
  }
  process.exit(0);
}

const p = String(input.file_path ?? input.notebook_path ?? "").replace(/\\/g, "/");
if (isSecret(baseName(p))) {
  const verb = ev.tool_name === "Read" ? "read" : "edit";
  block(`${p} is a secrets file; the agent must not ${verb} it.`);
}
process.exit(0);
