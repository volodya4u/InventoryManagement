# Tasks — ci-tee-pipefail

- [x] 1. Confirm the two `| tee` steps of `build-and-test` run without `pipefail`; obtain approval for the CI workflow
  edit.
- [x] 2. Extend `scripts/ci-workflow.test.mjs` to every `| tee` step; record an assertion red for both criteria through
  `node scripts/test-run.mjs`.
- [x] 3. Give `ci.yml` a workflow-level Bash default and let the test resolve it; record the green run of the same test.
- [ ] 4. Add the autonomy-log row, run the Factory checks and `node scripts/dod.mjs`, obtain a fresh read-only review
  and `/security-review`, commit the evidence, verify `pr-evidence`, and open a separate pull request.
