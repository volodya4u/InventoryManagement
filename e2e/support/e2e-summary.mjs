// What docs/qa/e2e-report.json says about a whole Playwright run. The acceptance-method gate (check-acceptance-methods.mjs)
// reads its `status` for the `e2e` class (NFR-17), so "passed" is given only to a run that finished, had no failing test, and
// ran every supported browser: a Chromium-only run is "incomplete", never a pass. Pure, so scripts/e2e-report.test.mjs tests it
// without a browser; e2e/support/e2e-report-reporter.mjs does the file work.
// The same list as `browsers` in run-settings.mjs; scripts/e2e-report.test.mjs checks that they agree. It is repeated here because
// Playwright loads a reporter through its own module loader, which does not give a named import from run-settings.mjs.
export const supportedBrowsers = ['chromium', 'firefox', 'webkit'];

// results: [{ project, status }] with Playwright's test statuses; runStatus is the runner's own (passed, failed, timedout,
// interrupted).
export function summarize(results, runStatus) {
  const counts = Object.fromEntries(supportedBrowsers.map((name) => [name, { passed: 0, failed: 0, skipped: 0 }]));
  for (const { project, status } of results) {
    const count = counts[project];
    if (!count) continue;
    if (status === 'passed') count.passed += 1;
    else if (status === 'skipped') count.skipped += 1;
    else count.failed += 1;
  }
  const failed = runStatus !== 'passed' || Object.values(counts).some((count) => count.failed > 0);
  const notRun = supportedBrowsers.filter((name) => counts[name].passed === 0);
  let status = 'passed';
  let note = 'Every supported browser ran the whole suite and no test failed.';
  if (failed) {
    status = 'failed';
    note = 'The run failed, timed out or was interrupted, or a test failed.';
  } else if (notRun.length > 0) {
    status = 'incomplete';
    note = `No test passed in ${notRun.join(' and ')}: a run of fewer than all supported browsers is not a pass.`;
  }
  return { status, browsers: counts, note };
}
