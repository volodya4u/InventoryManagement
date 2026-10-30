# Design — playwright-recordings

## One script of each flow
The plugin's `record-demos` keeps a second list of flows beside the tests. Here the specs are the flows: a test that proves
requirements carries `// @trace FR-n` above it, `check-traceability.mjs` already reads that tag, and the recording reporter reads
the same line to name what the clip proves. The recording run is the same specs with video on, in Chromium, with a pause after
every action so the clip can be followed. A clip is `asserted` only if its test passed (`retries: 0` in a recording run), so the
recording and the proof are one step, which is the point of the reference script's design without its duplication.

## Data
Each test starts from the state it needs, set up through the API as the administrator (`e2e/support/api.ts`), and drives and
asserts the page. Names are unique per test (a tag in the name), because the tests of a browser share one database. The report
spec uses a month of its own per test for the same reason. The change-password spec runs last, because it changes the password
the other specs sign in with.

## Why a server per browser
The specs create `Peony`, `BQ-001` and so on. A second browser against the same database would find them. One JAR per project
(ports 18081 to 18083, each with its own SQLite file) is simpler and more robust than cleaning up between browsers, and the
extra JVMs are small.

## Exemptions
The list is a JSON file next to the manifests, read by the gate. It is checked as strictly as a recording: a real MVP
requirement, a reason, a covering test that exists and is tagged, and no recording of the same requirement. The traceability
report prints `exempt` in the Recording column, so the difference between recorded and exempt stays visible. Requirements are
exempt only where there is no page to show them (startup, database constraints, server-side validation the pages never send,
migration, a race that cannot be staged, a negative rule).

## What a clip does and does not prove
It shows that the test ran in Chromium and its assertions held, with the page on video. It does not show that a person finds
the page legible or the layout right (the vision check, next pull request), that Firefox and WebKit behave the same (the
`e2e` job runs the same specs in all three, but without video), or that the manual plan was run.
