// The files of a recorded run (docs/qa/demo-recordings/): which requirements each clip proves, and the manifest that
// scripts/check-recordings.mjs and scripts/check-traceability.mjs read. Pure functions, so scripts/e2e-recording.test.mjs
// can test them without a browser; e2e/support/recording-reporter.mjs does the file work.
//
// The proof of a clip is the `// @trace FR-n` comment directly above its test: the same tag check-traceability.mjs joins to
// a test, so a clip and the requirement it proves cannot drift apart.

export const outputDir = "docs/qa/demo-recordings";

// The ids of the `// @trace` comment on the line directly above the test that starts on `line` (1-based), or "".
export function proofFromSource(sourceText, line) {
  const above = sourceText.split(/\r?\n/)[line - 2] ?? "";
  return /^\s*\/\/\s*@trace\s+(.+?)\s*$/.exec(above)?.[1] ?? "";
}

const slug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56)
    .replace(/-+$/, "");

export function clipId(order, title) {
  return `${String(order).padStart(2, "0")}-${slug(title)}`;
}

// entry: { order, title, proof, status } (status is Playwright's: passed, failed, timedOut, skipped, interrupted).
export function buildManifest(entries) {
  const results = entries
    .filter((entry) => entry.proof)
    .map((entry) => {
      const id = clipId(entry.order, entry.title);
      return {
        id,
        title: entry.title,
        proof: entry.proof,
        video: `${outputDir}/${id}.webm`,
        screenshot: `${outputDir}/${id}.png`,
        explainer: `${outputDir}/${id}.md`,
        asserted: entry.status === "passed",
      };
    });
  return { kind: "demo", results };
}

export function explainer(entry) {
  const id = clipId(entry.order, entry.title);
  const result = entry.status === "passed" ? "asserted" : `FAILED (${entry.status})`;
  return `# ${entry.title}\n\n**Proves:** ${entry.proof}\n\n**Result:** ${result}\n\n![still](${id}.png)\n`;
}
