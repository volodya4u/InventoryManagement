#!/usr/bin/env node
// Claude Code PreToolUse hook (matcher: Read|Edit|Write|NotebookEdit|Grep|Bash).
// Blocks reading or writing secrets files (.env, .env.local, .env.production ...); .env.example stays open.
//   Read/Edit/Write/NotebookEdit: the file path.
//   Grep: the path, and a glob that can match a secrets file. A glob makes ripgrep search files .gitignore hides,
//   and the permissions.deny rules only check the directory Grep searches, not the files the glob lets in.
//   Bash: routes that read a secrets file without naming it, which the deny rules cannot see: shell globs and braces
//   that expand to one (.e*, .en?, {.env,x}), also inside $(...), backticks and unquoted heredocs; git diff
//   --no-index or a path outside the work tree, and git diff or git grep run outside the project (cd, -C,
//   --git-dir, --work-tree), where git works as with --no-index; git grep --no-index / --no-exclude-standard;
//   recursive diff; recursive grep unless every --include glob keeps .env out; rg -u, --no-ignore and globs that can
//   match .env. A .env named outright is left to the deny rules, so commit messages may mention it.
//   Glob is not matched on purpose: it returns names, never contents.
// Text checks are not a sandbox: sh -c, variables, a script that opens the file itself, and file names fed through
// xargs or find -exec still get through; native Windows has no Claude Code sandbox, the PowerShell tool is not
// covered, and a hook that crashes or times out lets the call run.
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
    "i", // like isSecret, and rg --iglob ignores case
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
// Is offset `end` of `text` inside quotes?
const insideQuotes = (text, end) => {
  let quote = "";
  for (let i = 0; i < end; i++) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'") quote = "";
    } else if (c === "\\") i++;
    else if (c === "'" && !quote) quote = "'";
    else if (c === '"') quote = quote ? "" : '"';
  }
  return quote !== "";
};
// The inner text of each $(...) and `...`: bash runs it even inside double quotes, but not inside single quotes.
const substitutions = (text) => {
  const found = [];
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'") quote = "";
    } else if (c === "\\") {
      i++;
    } else if (c === "'" && !quote) {
      quote = "'";
    } else if (c === '"') {
      quote = quote ? "" : '"';
    } else if (c === "`") {
      const end = text.indexOf("`", i + 1);
      found.push(text.slice(i + 1, end < 0 ? text.length : end));
      i = end < 0 ? text.length : end;
    } else if (c === "$" && text[i + 1] === "(") {
      let depth = 0;
      let j = i + 1;
      for (; j < text.length; j++) {
        if (text[j] === "(") depth++;
        else if (text[j] === ")" && --depth === 0) break;
      }
      found.push(text.slice(i + 2, j));
      i = j;
    }
  }
  return found;
};
// <<[-]DELIM, the rest of that line, the body, and the closing DELIM line.
const HEREDOC = /<<-?[ \t]*(\\?)(['"]?)(\w+)\2([^\n]*)\n(?:([\s\S]*?)\n)?[ \t]*\3[ \t]*(?=\n|$)/g;
// Every piece of shell text that runs: the command without heredoc bodies (data, such as commit messages), plus the
// command substitutions in it and in heredoc bodies whose delimiter is unquoted (<<EOF runs them, <<'EOF' does not).
const scripts = (text) => {
  const bodies = [];
  const stripped = text.replace(HEREDOC, (match, backslash, quote, delimiter, rest, body = "", offset) => {
    if (insideQuotes(text, offset)) return match;
    if (!backslash && !quote) bodies.push(...substitutions(body));
    return ` ${rest}`;
  });
  return [stripped, ...[...substitutions(stripped), ...bodies].flatMap(scripts)];
};
// Git, GNU grep and GNU diff accept an unambiguous abbreviation of a long option (--no-ind), so match every prefix.
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

const checkGit = (args, leftProject) => {
  // Outside any repository (cd, -C, --git-dir, --work-tree), git diff of two paths runs as --no-index, and git grep
  // may too (grep.fallbackToNoIndex).
  let elsewhere = leftProject;
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    const place = optionValue(args[i], i, args, ["-C", "--git-dir", "--work-tree"]);
    if (place !== undefined) elsewhere ||= outsideWorkTree(place);
    i += /^(-[Cc]|--(git-dir|work-tree|namespace|config-env))$/.test(args[i]) ? 2 : 1;
  }
  const [sub, ...subArgs] = args.slice(i);
  if (sub === "diff" && subArgs.some((arg) => optionPrefix(arg, ["--no-index"]))) {
    block("git diff --no-index compares files outside git's index, so it prints .gitignore'd files such as .env.");
  }
  if (sub === "diff" && (elsewhere || subArgs.some(outsideWorkTree))) {
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
  let leftProject = false;
  for (const words of subcommands(script)) {
    const glob = words.find(({ text }) => /(^|[^\\])[*?[{]/.test(text) && globHitsSecret(text, true));
    if (glob !== undefined) block(`the shell pattern ${unescape(glob.text)} can expand to a .env file.`);
    const args = words.filter(({ redirect }) => !redirect).map(({ text }) => unescape(text));
    if (/^(cd|pushd)$/.test(args[0])) {
      const target = args.slice(1).filter((arg) => !/^-[LPe@]+$/.test(arg)).at(-1);
      leftProject ||= target === undefined || target === "-" || outsideWorkTree(target);
    }
    // The first program word, so wrappers such as nice, timeout 30 or xargs are covered too.
    const at = args.findIndex((word) => /^(git|[ef]?grep|rgrep|diff|rg)(\.exe)?$/.test(baseName(word)));
    if (at < 0) continue;
    const program = baseName(args[at]).replace(/\.exe$/, "");
    const rest = args.slice(at + 1);
    if (program === "git") checkGit(rest, leftProject);
    else if (program === "rg") checkRipgrep(rest);
    else if (program === "diff") {
      if (rest.some(recursive)) block("recursive diff prints every file, .env included. Use git diff.");
    } else if ((program === "rgrep" || rest.some(recursive)) && !safeIncludes(rest)) {
      block("recursive grep reads every file, .env included. Use the Grep tool (it skips .gitignore'd files) or limit grep with --include=*.ts.");
    }
  }
};

if (ev.tool_name === "Bash") {
  for (const script of scripts(String(input.command ?? ""))) checkScript(script);
  process.exit(0);
}

const p = String(input.file_path ?? input.notebook_path ?? "").replace(/\\/g, "/");
if (isSecret(baseName(p))) {
  const verb = ev.tool_name === "Read" ? "read" : "edit";
  block(`${p} is a secrets file; the agent must not ${verb} it.`);
}
process.exit(0);
