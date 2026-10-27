# Design — per-side coverage ratchet

## Collection

- **Backend.** JaCoCo's runtime agent (`org.jacoco:org.jacoco.agent`, classifier `runtime`, test scope) goes on Surefire's
  `argLine` beside Mockito's, through the same `maven-dependency-plugin` `properties` path, with a relative
  `destfile=target/jacoco.exec`; `jacoco-maven-plugin`'s `report` goal (verify) reads that file and writes
  `target/site/jacoco/jacoco.xml`. *Changed during implementation:* the plan used `prepare-agent` with `@{argLine}`, but its
  absolute `destfile` contains this checkout's Cyrillic folder name, and the forked JVM on Windows then failed with
  "processing of -javaagent failed". The relative path resolves against the module directory (Surefire's working
  directory), so it has no such characters; the owner approved the test-scoped agent dependency. `append=false` makes each
  run's `jacoco.exec` start empty, so a local `mvn verify` without `clean` measures what a fresh CI checkout does.
- **Frontend.** The Angular unit-test builder enables coverage with `--coverage` and takes `coverageReporters`; Vitest needs
  the `@vitest/coverage-v8` provider. Only `json-summary` is configured, so the console output that `ci-test-guard.mjs` and
  `frontendVerdict` parse does not change. `coverageInclude: ["src/**/*.ts"]` counts every source file, also one no spec
  imports (without it Vitest counts only the files a test loaded, so a new untested file would not lower the total);
  Vitest's default excludes leave the spec files out. Coverage is turned on by the CI and DoD commands, not in
  `angular.json`, so a targeted `test-run.mjs` run stays as fast as before.

## Conversion

The ratchet reads the istanbul json-summary shape (`total.<metric>.pct`). `scripts/jacoco-summary.mjs` takes the counters
that are direct children of `<report>` (the totals; package, class and method counters are nested deeper) and maps
`LINE`→lines, `INSTRUCTION`→statements, `METHOD`→functions, `BRANCH`→branches, with `pct` rounded to two decimals and 100
for an empty counter, as istanbul does. A missing report, or one without report-level counters, is an error: a summary
that silently reads 0 or 100 would arm a wrong baseline.

## Ratchet

One baseline per side keeps a frontend drop from hiding behind a backend gain, which a merged summary weighted by Java
lines would allow. The locked `check-coverage-ratchet.mjs` gains options instead of a second copy:

- `--summary=<path>` and `--baseline=<path>` replace the two default paths; without them the script reads
  `coverage/coverage-summary.json` and `quality/coverage-baseline.json` as before.
- `--label=<name>` prefixes the output lines and makes the waiver check name `coverage-ratchet:<name>`, so loosening one
  side needs a waiver for that side.
- `--require` turns a missing summary or baseline into FAIL. CI and the DoD pass it; `gate-status.mjs` does not, because the
  dashboard reports what is on disk and a missing summary there is NOT-EARNED, not broken.

The baselines `quality/coverage-backend-baseline.json` and `quality/coverage-frontend-baseline.json` are created by
`--update` from the first green run; nothing raises them by hand. Their names end in `-baseline.json`, so the integrity
lock's quality tier hashes them and a hand edit shows as drift.

## Wiring

- `gate-status.mjs`: G5 folds `coverageBackend` and `coverageFrontend`.
- CI `build-and-test`: the frontend test step adds `--coverage`; a "Coverage ratchet" step after the frontend guard runs the
  conversion and both ratchets.
- `dod.mjs`: the frontend test check adds `--coverage`; a "Coverage ratchet" check after it runs the same three commands,
  and `coverageVerdict` (in `dod-checks.mjs`) needs `Result: PASS` from both.
- `factory-lock.json` is re-sealed in the commit that edits the two locked scripts (ADR-0006).
