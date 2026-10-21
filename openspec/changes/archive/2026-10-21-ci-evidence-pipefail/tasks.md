# Tasks — ci-evidence-pipefail

- [x] 1. Verify PR #95's false-green job and GitHub Actions' shell behavior; obtain approval for the CI workflow edit.
- [x] 2. Record an assertion red for the pipeline regression test through `node scripts/test-run.mjs`.
- [x] 3. Make the PR evidence step use explicit Bash; record the green run of the same test.
- [x] 4. Add the autonomy-log row, run the Factory checks and `node scripts/dod.mjs`, obtain a fresh read-only review,
  commit the evidence, verify `pr-evidence`, and open a separate pull request.
