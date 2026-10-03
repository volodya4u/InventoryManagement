#!/usr/bin/env node
// Claude Code PreToolUse hook (matcher: Read|Edit|Write|NotebookEdit|Grep|Bash).
// Blocks reading or writing secrets files (.env, .env.local, .env.production ...); .env.example stays open.
//   Read/Edit/Write/NotebookEdit: the file path.
//   Grep: the path, and a glob that can match a secrets file. A glob makes ripgrep search files .gitignore hides,
//   and the permissions.deny rules only check the directory Grep searches, not the files the glob lets in.
//   Bash: routes that read a secrets file without naming it, which the deny rules cannot see: shell globs and braces
//   that expand to one (.e*, .en?, .en[]v], {.env,x}, .en{u..w}), also inside $(...), backticks and unquoted
//   heredocs; git diff --no-index or a path outside the work tree, and git diff or git grep run outside the project
//   (cd, -C, --git-dir, --work-tree, GIT_DIR=...), where git works as with --no-index; git grep --no-index /
//   --no-exclude-standard; recursive diff; recursive grep unless every --include glob keeps .env out; rg -u,
//   --no-ignore and globs that can match .env. A .env named outright is left to the deny rules, so commit messages
//   may mention it.
//   Glob is not matched on purpose: it returns names, never contents.
// Text checks are not a sandbox. Still open: sh -c, variables, a script that opens the file itself, file names fed
// through xargs or find -exec, other readers (findstr /s, tar, ag, ugrep), git aliases, git add -f, Windows 8.3
// short names, and the PowerShell tool. Native Windows has no Claude Code sandbox, and a hook that crashes or times
// out lets the call run.
// Exit code 2 = the tool call is BLOCKED and stderr is fed back to the agent as the reason.
// PreToolUse hooks run BEFORE the permission check, in EVERY permission mode (even bypassPermissions):
// hooks enforce, AGENTS.md only advises. The permissions.deny rules in settings.json are the second line of defence.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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
// Windows opens .env for .ENV, .env. or ".env " (it drops trailing dots and spaces) and .env::$DATA (a stream).
const isSecret = (name) => {
  const file = name.replace(/:.*$/, "").replace(/[. ]+$/, "").toLowerCase();
  return /^\.env(\..+)?$/.test(file) && file !== ".env.example";
};
const baseName = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? "";

// Common dotenv names to test a glob against.
const SAMPLES = [".env", ".env.local", ".env.development", ".env.production", ".env.test", ".env.staging"];
SAMPLES.push(...SAMPLES.slice(2).map((name) => `${name}.local`));

// Expand braces, innermost first, so every alternative is a plain glob. Escaped braces stay; a sequence such as
// {u..w} or {1..9} becomes *, which can only over-match.
const expandBraces = (glob) => {
  const plain = glob.replace(/(?<!\\)\{-?\w+\.\.-?\w+(\.\.-?\d+)?(?<!\\)\}/g, "*");
  const m = /(?<!\\)\{((?:[^{}\\]|\\.)*)(?<!\\)\}/.exec(plain);
  if (!m) return [plain];
  return m[1].split(/(?<!\\),/).flatMap((alt) => expandBraces(plain.slice(0, m.index) + alt + plain.slice(m.index + m[0].length)));
};
// The ] that closes the bracket expression opened at `i`, or -1: a ] right after [ or [! is a member, and [:alpha:],
// [.x.] and [=x=] are nested.
const bracketEnd = (segment, i) => {
  let j = i + 1;
  if (segment[j] === "!" || segment[j] === "^") j++;
  if (segment[j] === "]") j++;
  for (; j < segment.length; j++) {
    if (segment[j] === "]") return j;
    if (segment[j] === "[" && /[:.=]/.test(segment[j + 1] ?? "")) {
      const end = segment.indexOf(`${segment[j + 1]}]`, j + 2);
      if (end < 0) return -1;
      j = end + 1;
    }
  }
  return -1;
};
// One path segment of a glob as tokens: { lit } (lower case), { star } for *, { one } for ? and { one, bracket } for
// a bracket expression, which counts as any one character and so can only over-match.
const globTokens = (segment) => {
  const tokens = [];
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    const close = c === "[" ? bracketEnd(segment, i) : -1;
    if (c === "\\" && i + 1 < segment.length) tokens.push({ lit: segment[++i].toLowerCase() });
    else if (c === "*") tokens.push({ star: true });
    else if (c === "?") tokens.push({ one: true });
    else if (close > 0) {
      tokens.push({ one: true, bracket: true });
      i = close;
    } else tokens.push({ lit: c.toLowerCase() });
  }
  return tokens;
};
// Do the first tokens spell `name` one character each, before any *?
const spells = (tokens, name) => [...name].every((ch, i) => tokens[i] && !tokens[i].star && (tokens[i].one || tokens[i].lit === ch));
// Can this glob match a secrets file? Only its last segment matters: we assume the directories exist.
// A start that spells .env or .env.<name> (.e?v.qa, .en[]v], .env.q*) is one; where a * may stand for part of the
// name, the common dotenv names in SAMPLES are tried, so *.ts passes although it would match a file named .env.ts.
// ripgrep globs follow .gitignore rules, where * matches a leading dot; in the shell (`shell`) * and ? never do.
const globHitsSecret = (glob, shell = false) =>
  expandBraces(glob).some((alt) => {
    const tokens = globTokens(alt.replace(/\/+$/, "").split("/").pop());
    if (shell && (tokens[0]?.star || (tokens[0]?.one && !tokens[0].bracket))) return false;
    if (spells(tokens, ".env") && tokens.slice(4).every((t) => t.star)) return true;
    const name = tokens.slice(5);
    if (spells(tokens, ".env.") && name.length && name.map((t) => t.lit ?? "*").join("") !== "example") return true;
    const re = new RegExp(`^${tokens.map((t) => (t.star ? "[^/]*" : t.one ? "[^/]" : t.lit.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))).join("")}$`);
    return SAMPLES.some((sample) => re.test(sample));
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

// Read/Edit/Write/NotebookEdit, decided before the Bash code below so nothing there can break it.
if (ev.tool_name !== "Bash") {
  const p = String(input.file_path ?? input.notebook_path ?? "").replace(/\\/g, "/");
  if (isSecret(baseName(p))) {
    const verb = ev.tool_name === "Read" ? "read" : "edit";
    block(`${p} is a secrets file; the agent must not ${verb} it.`);
  }
  process.exit(0);
}

// Words of each subcommand, as { text, redirect }. A quoted or \-escaped character is \-escaped in `text`, so only
// unquoted globs and braces stay special. `redirect` marks the target of < or >: glob-checked, but not an argument.
// A # that starts a word starts a comment.
const subcommands = (cmd) => {
  const subs = [[]];
  let word = "";
  let inWord = false;
  let quote = "";
  let redirect = false;
  const literal = (c) => (/[*?[\]{}\\]/.test(c) ? `\\${c}` : c);
  const endWord = () => {
    if (inWord) {
      subs.at(-1).push({ text: word, redirect });
      redirect = false;
    }
    word = "";
    inWord = false;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote === "'") {
      if (c === "'") quote = "";
      else word += literal(c);
    } else if (quote === '"') {
      if (c === '"') quote = "";
      else if (c === "\\" && cmd[i + 1] === "\n") i++;
      else if (c === "\\" && /[$`"\\]/.test(cmd[i + 1] ?? "")) word += literal(cmd[++i]);
      else word += literal(c);
    } else if (c === "\\" && cmd[i + 1] === "\n") {
      i++; // a line continuation joins the lines
    } else if (c === "\\" && i + 1 < cmd.length) {
      word += literal(cmd[++i]);
      inWord = true;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === "#" && !inWord) {
      while (i + 1 < cmd.length && cmd[i + 1] !== "\n") i++;
    } else if (/[;&|()`\n]/.test(c)) {
      endWord();
      redirect = false;
      subs.push([]);
    } else if (c === "<" || c === ">") {
      if (/^\d+$/.test(word)) inWord = false; // the 2 of 2>
      endWord();
      redirect = true;
    } else if (/\s/.test(c)) {
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
// Walks shell text the way bash reads it: quotes, \ escapes, # comments, heredocs and command substitutions.
// From `start` it returns `out`, the text without heredoc bodies (data, such as commit messages), and `runs`, the
// inner text of every $(...) and `...` (bash runs them even inside double quotes, and inside the body of a heredoc
// whose delimiter is unquoted: <<EOF runs them, <<'EOF' does not). With `inner`, it stops at the ) that closes a
// $( and returns its index as `end`. In `body` mode (a heredoc body), quotes, comments and << are plain text.
const lex = (text, start = 0, inner = false, body = false) => {
  let out = "";
  const runs = [];
  const heredocs = []; // bodies start at the next newline
  let quote = "";
  let depth = 0;
  let i = start;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quote === "'") {
      out += c;
      if (c === "'") quote = "";
    } else if (c === "\\") {
      out += text.slice(i, i + 2);
      i++;
    } else if (c === "$" && text[i + 1] === "(") {
      const sub = lex(text, i + 2, true);
      runs.push(sub.out, ...sub.runs);
      out += `$(${sub.out})`;
      i = sub.end;
    } else if (c === "`") {
      let end = i + 1;
      while (end < text.length && text[end] !== "`") end += text[end] === "\\" ? 2 : 1;
      const sub = lex(text.slice(i + 1, end));
      runs.push(sub.out, ...sub.runs);
      out += `\`${sub.out}\``;
      i = end;
    } else if (body) {
      out += c;
    } else if (quote === '"') {
      out += c;
      if (c === '"') quote = "";
    } else if (c === "'" || c === '"') {
      out += c;
      quote = c;
    } else if (c === "#" && /[\s;&|()]/.test(text[i - 1] ?? " ")) {
      while (i + 1 < text.length && text[i + 1] !== "\n") i++;
    } else if (text.startsWith("<<<", i)) {
      out += "<<<"; // a here-string, not a heredoc
      i += 2;
    } else if (c === "<" && text[i + 1] === "<") {
      const m = /^<<(-?)[ \t]*(\\?)(['"]?)(\w+)\3/.exec(text.slice(i));
      if (m) {
        heredocs.push({ delimiter: m[4], tabs: m[1] === "-", expands: !m[2] && !m[3] });
        out += " ";
        i += m[0].length - 1;
      } else {
        out += "<<";
        i++;
      }
    } else if (c === "\n" && heredocs.length) {
      out += c;
      let pos = i + 1;
      for (const heredoc of heredocs) {
        let content = "";
        while (pos < text.length) {
          const eol = text.indexOf("\n", pos) < 0 ? text.length : text.indexOf("\n", pos);
          const line = text.slice(pos, eol);
          pos = eol + 1;
          if ((heredoc.tabs ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) break;
          content += `${line}\n`;
        }
        if (heredoc.expands) runs.push(...lex(content, 0, false, true).runs);
      }
      heredocs.length = 0;
      i = pos - 2; // the loop moves on to the newline after the delimiter line
    } else if (inner && c === "(") {
      depth++;
      out += c;
    } else if (inner && c === ")" && depth-- === 0) {
      return { out, runs, end: i };
    } else {
      out += c;
    }
  }
  return { out, runs, end: i };
};
// Every piece of shell text that runs: the command without heredoc bodies, and each command substitution.
const scripts = (text) => {
  const { out, runs } = lex(text);
  return [out, ...runs];
};
// Git, GNU grep and GNU diff accept an unambiguous abbreviation of a long option (--no-ind), so match every prefix.
const optionPrefix = (arg, options) => /^--./.test(arg) && options.some((option) => option.startsWith(arg.split("=")[0]));
// Paths: on Windows a Git Bash path (/d/x) means D:\x, and paths compare as lower-case d:/x.
const win = process.platform === "win32";
const native = (arg) => (win ? arg.replace(/^\/([a-zA-Z])(\/|$)/, "$1:/") : arg);
const norm = (p) => (win ? p.replace(/\\/g, "/").toLowerCase() : p).replace(/(.)\/+$/, "$1");
const cwd = resolve(typeof ev.cwd === "string" && ev.cwd ? ev.cwd : process.cwd());
// The git work tree: the nearest directory up from the cwd that holds .git (a worktree has a .git file).
const project = (() => {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return norm(dir);
    if (dirname(dir) === dir) return norm(cwd);
  }
})();
const inProject = (dir) => `${norm(dir)}/`.startsWith(`${project}/`);
// Does `arg`, seen from `dir`, point outside the work tree? /dev/null, \\server\share and ~ do, and so does a
// Windows drive path on Linux too, so the rule is the same on a Windows machine and in Linux CI.
const outsideWorkTree = (arg, dir = cwd) =>
  /^(~|\\)/.test(arg) || (!win && /^[A-Za-z]:[\\/]/.test(arg)) || !inProject(resolve(dir, native(arg)));
// The value of option `arg` (from --opt=value or the next word), when arg is a prefix of one of `options`.
const optionValue = (arg, i, args, options) => {
  if (arg.startsWith("-") && !arg.startsWith("--")) return options.includes(arg) ? args[i + 1] : undefined;
  if (!optionPrefix(arg, options)) return undefined;
  return arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[i + 1];
};
// grep and diff -r / --recursive (any prefix), grep -d or --directories with any prefix of `recurse`.
const recursive = (arg, i, args) => {
  if (/^-[^-]*[rR]/.test(arg) || optionPrefix(arg, ["--recursive", "--dereference-recursive"])) return true;
  const action = optionValue(arg, i, args, ["-d", "--directories"]);
  return Boolean(action) && "recurse".startsWith(action);
};
// grep --include=GLOB reads only files whose name matches GLOB (and its * matches a leading dot, like ripgrep's).
const safeIncludes = (args) => {
  const globs = args.flatMap((arg, i) => (optionPrefix(arg, ["--include"]) ? [optionValue(arg, i, args, ["--include"]) ?? "*"] : []));
  return globs.length > 0 && !globs.some((glob) => globHitsSecret(glob));
};

const checkGit = (args, leftProject, dir) => {
  // Outside any repository, git diff of two paths runs as --no-index, and git grep may too (grep.fallbackToNoIndex).
  // That happens after a cd or -C out of the project, and with any --git-dir or --work-tree (or GIT_DIR=...), since
  // git also falls back to it when that path is not a repository.
  let elsewhere = leftProject;
  let gitDir = dir;
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    const place = optionValue(args[i], i, args, ["-C"]);
    if (place !== undefined) {
      elsewhere ||= outsideWorkTree(place, gitDir);
      gitDir = resolve(gitDir, native(place));
    }
    if (optionPrefix(args[i], ["--git-dir", "--work-tree"])) elsewhere = true;
    i += /^(-[Cc]|--(git-dir|work-tree|namespace|config-env))$/.test(args[i]) ? 2 : 1;
  }
  const [sub, ...subArgs] = args.slice(i);
  if (sub === "diff" && subArgs.some((arg) => optionPrefix(arg, ["--no-index"]))) {
    block("git diff --no-index compares files outside git's index, so it prints .gitignore'd files such as .env.");
  }
  if (sub === "diff" && (elsewhere || subArgs.some((arg) => outsideWorkTree(arg, gitDir)))) {
    block("git diff outside the project, or of a path outside the work tree, runs as --no-index, which prints .gitignore'd files such as .env. Use paths inside the project.");
  }
  if (sub === "grep" && (elsewhere || subArgs.some((arg) => optionPrefix(arg, ["--no-index", "--no-exclude-standard"])))) {
    block("git grep --no-index, --no-exclude-standard or run outside the project searches .gitignore'd files such as .env; plain git grep searches tracked files.");
  }
};

// rg honours .gitignore unless told not to: -u, --no-ignore*, or a glob that lets the file in (like the Grep tool's).
const checkRipgrep = (args) => {
  if (args.some((arg) => /^-[a-zA-Z]*u/.test(arg) || /^--(unrestricted|no-ignore)/.test(arg))) {
    block("rg -u and --no-ignore search .gitignore'd files such as .env. Use the Grep tool.");
  }
  const globs = args.flatMap((arg, i) => {
    if (/^(-g|--i?glob)$/.test(arg)) return [args[i + 1] ?? "*"];
    if (/^--i?glob=/.test(arg)) return [arg.slice(arg.indexOf("=") + 1)];
    return /^-g./.test(arg) ? [arg.slice(2)] : [];
  });
  if (globs.some((glob) => !glob.startsWith("!") && globHitsSecret(glob))) {
    block("an rg glob that can match .env makes rg search .gitignore'd files. Narrow it to file types such as *.ts.");
  }
};

const checkScript = (script) => {
  let dir = cwd; // follows cd and pushd
  let lost = false; // cd with no target, cd - or cd ~, or a GIT_DIR=... assignment
  for (const words of subcommands(script)) {
    const glob = words.find(({ text }) => /(^|[^\\])[*?[{]/.test(text) && globHitsSecret(text, true));
    if (glob !== undefined) block(`the shell pattern ${unescape(glob.text)} can expand to a .env file.`);
    const args = words.filter(({ redirect }) => !redirect).map(({ text }) => unescape(text));
    if (/^(cd|pushd)$/.test(args[0])) {
      const target = args.slice(1).filter((arg) => !/^-[LPe@]+$/.test(arg)).at(-1);
      if (target === undefined || target === "-" || /^~/.test(target)) lost = true;
      else dir = resolve(dir, native(target));
    }
    // GIT_DIR=x git diff ..., env GIT_DIR=x ..., export GIT_DIR=x
    const firstWord = args.findIndex((arg) => !/^\w+=/.test(arg));
    const assigned = /^(export|env|declare|typeset|local|readonly)$/.test(args[0]) ? args : args.slice(0, firstWord < 0 ? args.length : firstWord);
    if (assigned.some((arg) => /^GIT_(DIR|WORK_TREE|COMMON_DIR|CEILING_DIRECTORIES)=/.test(arg))) lost = true;
    // The first program word, so wrappers such as nice, timeout 30 or xargs are covered too.
    const at = args.findIndex((word) => /^(git|[ef]?grep|rgrep|diff|rg)(\.exe)?$/.test(baseName(word)));
    if (at < 0) continue;
    const program = baseName(args[at]).replace(/\.exe$/, "");
    const rest = args.slice(at + 1);
    if (program === "git") checkGit(rest, lost || !inProject(dir), dir);
    else if (program === "rg") checkRipgrep(rest);
    else if (program === "diff") {
      if (rest.some(recursive)) block("recursive diff prints every file, .env included. Use git diff.");
    } else if ((program === "rgrep" || rest.some(recursive)) && !safeIncludes(rest)) {
      block("recursive grep reads every file, .env included. Use the Grep tool (it skips .gitignore'd files) or limit grep with --include=*.ts.");
    }
  }
};

for (const script of scripts(String(input.command ?? ""))) checkScript(script);
process.exit(0);
