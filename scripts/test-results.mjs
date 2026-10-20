// Structured test results for scripts/test-run.mjs: each test of a run with its id and status, read from the report
// the runner writes rather than from its console, so pr-evidence.mjs can tell the criterion's own test from the rest of
// its class or file, and an assertion from an exception or a skipped test.
//   id      backend `Class#method` (the simple class name; a nested class reads `Outer$Inner`);
//           a file `<repo path> › <suite > ... > title>`
//   status  pass | assertion (a failed assertion) | error (any other failure) | skipped (also pending and todo)
// Readers: Surefire XML (target/surefire-reports/TEST-*.xml), node:test's junit reporter and Vitest's json reporter.
// No dependency: the XML reader below knows only what those two JUnit writers emit.

const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decode = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name) => {
    if (name[0] === "#") return String.fromCodePoint(name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
    return ENTITIES[name] ?? whole;
  });

function attributes(text) {
  const found = {};
  for (const m of text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) found[m[1]] = decode(m[2] ?? m[3]);
  return found;
}

// The testcase elements of a JUnit XML document, with the names of the testsuite elements around them and the type,
// message and text of their failure / error / skipped child.
function testcases(xml) {
  const token = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  const suites = [];
  const cases = [];
  let current = null;
  let outcome = null;
  let last = 0;
  for (const m of String(xml).matchAll(token)) {
    if (outcome) outcome.text += m[1] ?? decode(xml.slice(last, m.index));
    last = m.index + m[0].length;
    const [, , closing, name, attrs, selfClosing] = m;
    if (!name) continue;
    if (closing) {
      if (name === "testsuite") suites.pop();
      else if (name === "testcase") current = null;
      else if (outcome && name === outcome.kind) outcome = null;
      continue;
    }
    if (name === "testsuite") {
      if (!selfClosing) suites.push(attributes(attrs).name ?? "");
    } else if (name === "testcase") {
      current = { ...attributes(attrs), suites: [...suites], outcome: null };
      cases.push(current);
      if (selfClosing) current = null;
    } else if (current && ["failure", "error", "skipped"].includes(name) && !current.outcome) {
      current.outcome = { kind: name, ...attributes(attrs), text: "" };
      if (!selfClosing) outcome = current.outcome;
    }
  }
  return cases;
}

const ASSERTION = /^\s*AssertionError\b|\bcause: AssertionError\b|\bAssertionFailedError\b/m;

function statusOf(c, { assertionOnFailure }) {
  const o = c.outcome;
  if (!o) return "pass";
  if (o.kind === "skipped") return "skipped";
  if (o.kind === "error") return "error";
  // Surefire writes an AssertionError as <failure> and anything else as <error>; node:test writes every failure as
  // <failure> and names its cause in the text.
  if (assertionOnFailure) return "assertion";
  return ASSERTION.test(`${o.text}\n${o.message ?? ""}`) ? "assertion" : "error";
}

// kind "surefire": ids from the classname; kind "node": ids from `file` (the repo path of the test file run).
export function junitTests(xml, { kind, file }) {
  return testcases(xml).map((c) => {
    const id =
      kind === "surefire"
        ? `${String(c.classname ?? "").split(".").at(-1)}#${c.name ?? ""}`
        : `${file} › ${[...c.suites.filter(Boolean), c.name ?? ""].join(" > ")}`;
    return { id, status: statusOf(c, { assertionOnFailure: kind === "surefire" }) };
  });
}

const slashes = (path) => String(path).replace(/\\/g, "/").replace(/\/+$/, "");

// Vitest's json reporter: one entry per file, with each test's ancestor titles. Paths are made relative to the repo root.
export function vitestTests(json, root) {
  let report;
  try {
    report = JSON.parse(json);
  } catch {
    return [];
  }
  const base = `${slashes(root)}/`.toLowerCase();
  return (report.testResults ?? []).flatMap((file) => {
    const name = slashes(file.name ?? "");
    const path = name.toLowerCase().startsWith(base) ? name.slice(base.length) : name;
    return (file.assertionResults ?? []).map((t) => {
      const status =
        t.status === "passed"
          ? "pass"
          : t.status === "failed"
            ? ASSERTION.test(String(t.failureMessages?.[0] ?? "")) ? "assertion" : "error"
            : "skipped";
      return { id: `${path} › ${[...(t.ancestorTitles ?? []), t.title ?? ""].join(" > ")}`, status };
    });
  });
}
