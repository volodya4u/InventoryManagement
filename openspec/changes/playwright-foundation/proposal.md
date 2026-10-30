# Playwright foundation: browser tests that start the JAR

## Why

The project has no browser-level test. Three baseline waivers (NFR-17 supported browsers, NFR-18 devices and layout, NFR-20
accessibility) say "no mechanism", and release gate G7 cannot go green without recordings, which need a browser driver. The
owner approved Playwright (the one new dependency of the open work list) on 2026-10-30 and decided, for OQ-8, to cover
Chromium, Firefox and WebKit. This is the first of three pull requests (foundation; flows and recordings; accessibility, vision
checks and closing the waivers). It adds the machinery and one small proof that it works. It changes no product behaviour.

## What Changes

- **Root `package.json` and `pnpm-lock.yaml`**: private, `@playwright/test` as the only dependency, the script `test:e2e`. At the
  root because the Factory's gate scripts read the root `package.json` and `playwright.config.ts`; the Angular app keeps
  `frontend/package.json`.
- **`playwright.config.ts`**: the projects Chromium, Firefox and WebKit, one worker, and a `webServer` that runs the executable
  JAR. Its settings live in **`e2e/support/run-settings.mjs`**: IPv4 loopback `baseURL` (NFR-23), a throwaway SQLite file in the
  system temp directory, and an administrator password made for the run (in no file of the repository, on no command line).
- **`e2e/support/auth.ts`** and **`e2e/sign-in.spec.ts`**: the sign-in helper and two specs (a wrong password; sign in to the
  dashboard and sign out), tagged `@trace FR-1, FR-3, FR-9`.
- **CI**: `build-and-test` keeps the JAR as an artifact; a new `e2e` job downloads it and runs the specs; Dependabot
  auto-merge now waits for `e2e` as well.
- **`.github/dependabot.yml`** gets an npm entry for `/`; **`.gitignore`** gets `node_modules/`, `test-results/`, `playwright-report/`.
- README ("Browser Tests") and `docs/current-state.md` say how to run them.
- Not changed: the application, its tests, `dod.mjs` (the browser tests are not part of the Definition of done yet), any gate
  script or the integrity lock.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given the settings of a browser-test run, when they are made, then the application is reached on `http://127.0.0.1:<port>` and started on that port | `scripts/e2e-setup.test.mjs` › "the browser tests reach the application on the IPv4 loopback address" |
| 2 | Given the settings, when the database is chosen, then it is a SQLite file in a temporary directory, passed to the application | `scripts/e2e-setup.test.mjs` › "the application runs on a throwaway database outside the repository" |
| 3 | Given two runs, when the settings are made, then each has its own administrator password, held in the environment, given to the application as its administrator password variable, and absent from the command line | `scripts/e2e-setup.test.mjs` › "the administrator password is made for each run and kept off the command line" |
| 4 | Given the settings were made once, when Playwright evaluates its configuration again in a worker, then it gets the same values | `scripts/e2e-setup.test.mjs` › "every process of a run gets the same settings" |
| 5 | Given values in the environment, when the settings are made, then the port, the JAR and the password can be overridden | `scripts/e2e-setup.test.mjs` › "the settings can be overridden from the environment" |
| 6 | Given the configuration, when it is read, then it runs the specs in Chromium, Firefox and WebKit and takes its settings from `runSettings` | `scripts/e2e-setup.test.mjs` › "the Playwright configuration runs the specs in Chromium, Firefox and WebKit" |
| 7 | Given the CI workflow, when it is read, then the `e2e` job starts after `build-and-test`, downloads the JAR that job uploaded and runs `pnpm run test:e2e` | `scripts/e2e-setup.test.mjs` › "the browser tests job in CI starts after the build and runs the JAR that build made" |
| 8 | Given the CI workflow, when a Dependabot update arrives, then auto-merge waits for `e2e` as well as `build-and-test` | `scripts/e2e-setup.test.mjs` › "Dependabot auto-merge waits for the browser tests" |

The two Playwright specs prove FR-1, FR-3 and FR-9 in a real browser; they are run by `pnpm run test:e2e` and by the CI `e2e`
job, not by `test-run.mjs`, which has no Playwright runner. Their evidence is the CI job, not a record in the agent log.

## Impact

- Affected files: `package.json`, `pnpm-lock.yaml`, `playwright.config.ts`, `e2e/**`, `scripts/e2e-setup.test.mjs`,
  `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.gitignore`, `README.md`, `docs/current-state.md`,
  `docs/autonomy-log.md`, this change folder.
- A new dependency (`@playwright/test`, with the three browsers it downloads, about 0.5 GB per machine; CI installs them each run
  and the `e2e` job adds a few minutes). Dependabot opens a monthly pull request for it.
- The `e2e` job names a browser failure separately and, being a requirement of Dependabot auto-merge, holds up an update that
  breaks the browser tests. A browser flake can delay such a merge; re-run the job.
- Rollback: revert the commit; no data or schema change.
