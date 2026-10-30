// A Playwright reporter that turns a recorded run into docs/qa/demo-recordings/: for every passed or failed test of the
// chromium project that proves requirements (a `// @trace` tag above it), the video, a settled still, a short explainer, and
// a manifest.json. A clip counts as asserted only when its test passed, so the recording and the proof are one step.
// It is added to the configuration only when E2E_RECORD is set (playwright.config.ts); `pnpm run record:demos` sets it.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildManifest, clipId, explainer, outputDir, proofFromSource } from './recording-manifest.mjs';

export default class RecordingReporter {
  entries = [];

  onBegin(config) {
    this.root = config.rootDir.replace(/[\\/]e2e$/, '');
    this.dir = join(this.root, outputDir);
    mkdirSync(this.dir, { recursive: true });
    // Start from nothing: a clip that no longer exists must not stay behind. Only the files this reporter writes.
    for (const name of readdirSync(this.dir)) {
      if (/\.(webm|png|md)$/.test(name) || name === 'manifest.json') unlinkSync(join(this.dir, name));
    }
  }

  onTestEnd(test, result) {
    if (test.parent.project()?.name !== 'chromium' || result.status === 'skipped') return;
    const order = this.entries.length + 1;
    const proof = proofFromSource(readFileSync(test.location.file, 'utf8'), test.location.line);
    const entry = { order, title: test.title, proof, status: result.status };
    this.entries.push(entry);
    if (!proof) return;
    const id = clipId(order, test.title);
    const attachment = (name) => result.attachments.find((a) => a.name === name && a.path && existsSync(a.path));
    const video = attachment('video');
    const screenshot = attachment('screenshot');
    if (video) copyFileSync(video.path, join(this.dir, `${id}.webm`));
    if (screenshot) copyFileSync(screenshot.path, join(this.dir, `${id}.png`));
    writeFileSync(join(this.dir, `${id}.md`), explainer(entry));
  }

  onEnd() {
    writeFileSync(join(this.dir, 'manifest.json'), `${JSON.stringify(buildManifest(this.entries), null, 2)}\n`);
  }
}
