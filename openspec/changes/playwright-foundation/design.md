# Design — playwright-foundation

## Why the root, and why `pnpm`
The Factory's gate scripts (`check-acceptance-methods.mjs`) read the root `package.json` for Playwright and the root
`playwright.config.*` for the `e2e` class, so both sit at the root. The Angular app keeps its own manifest and lock file;
Dependabot gets a second npm entry. pnpm, because the repository allows no other package manager (`AGENTS.md`); the root pins the
same version as the frontend (`packageManager`), and CI installs that version.

## Settings in a plain module
Playwright evaluates `playwright.config.ts` in the main process and again in every worker, so a value made at load time (a random
password, a temporary directory) would differ between them. `e2e/support/run-settings.mjs` makes each value once, writes it back
into the environment (`??=`), and every later evaluation reads the same one. It is `.mjs` and imports nothing from Playwright so
that `scripts/e2e-setup.test.mjs` can import it in the `Agent harness self-test` step, which runs before any `pnpm install`.
The test reads `playwright.config.ts` and `ci.yml` as text for the two criteria that are about their shape.

## The server under test
The real executable JAR, started by Playwright's `webServer` with `--server.port` and `--spring.datasource.url` overrides. The
administrator password comes from `APP_ADMIN_INITIAL_PASSWORD` in the child's environment (`serverEnvironment`), set from a UUID
made for the run. The variable's name is held in one constant: the pre-commit hook refuses a line that gives it a value other than an
empty one or a `${...}` reference (a literal would be a committed password), and it cannot tell a value made at run time
from a literal. The value here is a UUID made when the run starts, never a literal; the hook itself is unchanged. It
is in no file of the repository and on no command line, as `AGENTS.md` requires. A Playwright trace of a failed sign-in does
hold it (traces are kept on failure), and CI uploads the report; the password opens only the throwaway database of that run,
which does not outlive the CI runner. `reuseExistingServer` is false: a test must not attach to
someone's running instance. The port defaults to 18081, away from 8081 (the application) and 4200 (the dev server), so the
"never start a second instance" rule, which concerns those two, is not touched. Using the JAR, not `ng serve`, tests what ships
and needs no proxy.

## One worker, three browsers
All specs share one server and one database, so they run one after another (`workers: 1`); the three browsers are three projects
of the same run. A spec that changes data has to cope with the next project finding it changed; the two specs here change none.

## CI
`build-and-test` already builds the JAR. It uploads it (3 days) and `e2e` downloads it, so the JAR is built once. `e2e` is a
separate job: its failure is named as a browser failure, and the long browser install does not slow the build. Dependabot
auto-merge waits for both: a Playwright, Spring Boot or Angular bump is only safe if the browser tests still pass on it.

## What it does not do
The flows, the recordings, the accessibility and layout checks and the closing of the waivers are the next two pull requests.
`dod.mjs` does not run the browser tests yet: it is a locked chain, and adding a step is a gate change for its own approval.
