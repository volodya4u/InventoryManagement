# Tasks — bind-loopback

- [x] 1. Write `LoopbackBindingHttpTest` and record it red on an assertion through `node scripts/test-run.mjs backend LoopbackBindingHttpTest`.
- [x] 2. Set `server.address: 127.0.0.1` in `application-local.yml`, point the dev proxy and the launcher at `127.0.0.1`, and record green.
- [x] 3. Add NFR-23, update TC-4 and the baseline spec, the README, risks R-09 and R-10, the manual test plan (MT-29) and the acceptance report.
- [x] 4. Add the autonomy-log row, run the Factory checks and `node scripts/dod.mjs`, run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
