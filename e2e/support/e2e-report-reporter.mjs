// A Playwright reporter that writes docs/qa/e2e-report.json, the committed record of a whole run, for the `e2e` class of the
// acceptance-method gate. It is added to the configuration only when E2E_REPORT is set (playwright.config.ts), so a local or
// partial run never rewrites the file. `pnpm run report:e2e` runs the whole suite in every browser with it set.
// The report names no time, so a re-run that changes nothing changes no line.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarize } from './e2e-summary.mjs';

export default class E2eReportReporter {
  results = new Map();

  onBegin(config) {
    this.root = config.rootDir.replace(/[\\/]e2e$/, '');
  }

  onTestEnd(test, result) {
    // A retry replaces the first attempt: the last result of a test is its result.
    this.results.set(test.id, { project: test.parent.project()?.name, status: result.status });
  }

  onEnd(result) {
    const summary = summarize([...this.results.values()], result.status);
    const dir = join(this.root, 'docs', 'qa');
    mkdirSync(dir, { recursive: true });
    const report = { description: 'The last whole Playwright run (pnpm run report:e2e), from e2e/support/e2e-report-reporter.mjs.', ...summary };
    writeFileSync(join(dir, 'e2e-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
}
