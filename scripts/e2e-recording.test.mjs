import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest, clipId, explainer, proofFromSource } from "../e2e/support/recording-manifest.mjs";

const source = [
  "test.describe('x', () => {",
  "  // @trace FR-3",
  "  test('a wrong password is refused', async () => {});",
  "",
  "  // @trace FR-1, FR-9",
  "  test('the administrator signs in', async () => {});",
  "  test('a test with no tag', async () => {});",
  "});",
].join("\n");

test("the proof of a clip is the @trace tag directly above its test", () => {
  assert.equal(proofFromSource(source, 3), "FR-3");
  assert.equal(proofFromSource(source, 6), "FR-1, FR-9");
});

test("a test with no @trace tag directly above it proves nothing", () => {
  assert.equal(proofFromSource(source, 7), "");
  assert.equal(proofFromSource(source, 1), "");
});

test("a clip id is its order and a short slug of its title", () => {
  assert.equal(clipId(3, "A wrong password: refused, with the *single* message!"), "03-a-wrong-password-refused-with-the-single-message");
  assert.equal(clipId(12, "x".repeat(200)).length, 3 + 56);
});

test("the manifest lists every clip with its files and marks a clip asserted only when its test passed", () => {
  const manifest = buildManifest([
    { order: 1, title: "signs in", proof: "FR-1", status: "passed" },
    { order: 2, title: "fails to sign out", proof: "FR-9", status: "failed" },
    { order: 3, title: "timed out", proof: "FR-2", status: "timedOut" },
  ]);

  assert.equal(manifest.kind, "demo");
  assert.deepEqual(
    manifest.results.map((r) => [r.id, r.proof, r.asserted]),
    [
      ["01-signs-in", "FR-1", true],
      ["02-fails-to-sign-out", "FR-9", false],
      ["03-timed-out", "FR-2", false],
    ],
  );
  assert.equal(manifest.results[0].video, "docs/qa/demo-recordings/01-signs-in.webm");
  assert.equal(manifest.results[0].screenshot, "docs/qa/demo-recordings/01-signs-in.png");
  assert.equal(manifest.results[0].explainer, "docs/qa/demo-recordings/01-signs-in.md");
});

test("a clip with no proof is left out of the manifest", () => {
  const manifest = buildManifest([
    { order: 1, title: "no tag", proof: "", status: "passed" },
    { order: 2, title: "tagged", proof: "FR-1", status: "passed" },
  ]);

  assert.deepEqual(manifest.results.map((r) => r.id), ["02-tagged"]);
});

test("the explainer names the clip, what it proves and how it ended", () => {
  const text = explainer({ order: 1, title: "signs in", proof: "FR-1", status: "passed" });

  assert.match(text, /^# signs in/);
  assert.match(text, /\*\*Proves:\*\* FR-1/);
  assert.match(text, /\*\*Result:\*\* asserted/);
  assert.match(text, /!\[still\]\(01-signs-in\.png\)/);
  assert.match(explainer({ order: 2, title: "x", proof: "FR-2", status: "failed" }), /\*\*Result:\*\* FAILED/);
});
