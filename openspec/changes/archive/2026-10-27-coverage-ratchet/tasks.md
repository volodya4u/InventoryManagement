# Tasks — coverage-ratchet

- [x] 1. Record an assertion red through `node scripts/test-run.mjs` for each acceptance criterion's test.
- [x] 2. Add `scripts/jacoco-summary.mjs`, the ratchet's `--summary`/`--baseline`/`--label`/`--require` options and the
  Definition of done's coverage verdict; record the green runs of the same tests.
- [x] 3. Collect coverage: the JaCoCo plugin and Surefire `argLine` in `pom.xml`, `@vitest/coverage-v8` and the `json-summary`
  reporter in `frontend/`; create both baselines with `--update` after a green run.
- [x] 4. Ratchet both sides in `gate-status.mjs` (G5), CI's `build-and-test` job and `scripts/dod.mjs`; re-seal the
  factory lock.
- [x] 5. Add the autonomy-log row, run the Factory checks and `node scripts/dod.mjs`, obtain a fresh read-only review and a
  security review, commit the evidence, verify `pr-evidence`, and open a pull request.
