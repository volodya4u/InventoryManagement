# Make gate coverage and status explicit

## Why
The `pr-evidence` report showed ✅ for gates that checked nothing. In #72 (slice H1, `harden-security-tests`) the
**Red → green** row was green because the gate only looked at `docs/specs/` files the branch added, and that slice was an
OpenSpec change. The test runs in the report were therefore history, not an enforced requirement. The same ✅ also meant
"no code changed", "no new import" and "no significant change" on other rows, so a reader could not tell a pass from
a gate that did not apply.

## What Changes
- Every gate of `scripts/pr-evidence.mjs` reports one of four statuses in its own words. `✅ PASS` means the gate
  applied and held. `❌ FAIL` means it applied and did not hold. `➖ N/A` means it did not apply, and the report says why.
  `⚠️ WAIVED` means every failure is covered by an open waiver that someone approved, and the report says who. Only
  FAIL makes the job exit 1.
- **Red → green** covers every acceptance criterion the branch adds or changes, not only new `docs/specs/` files:
  - criteria of an added `docs/specs/*.md`;
  - criteria of an existing `docs/specs/*.md` whose row text or test differs from the base version;
  - criteria in the `## Acceptance criteria` table of an `openspec/changes/<slice>/proposal.md` (active or archived) that the
    branch adds or changes, written in the `docs/specs/` format.
  A slice proposal the branch adds without that table fails. A branch with none of these shows `N/A`.
- A harness test (`scripts/*.test.mjs`) can be named as `scripts/x.test.mjs` › "title". A harness TestRun of that file
  covers it.
- A criterion is waived only by a `docs/qa/waivers/*.md` that the branch adds. The waiver must say `Status: open`
  and name the gate (`Gate: Red → green`), the criteria (`Criteria: <path> AC<n>, AC<m>`, or `<path>` alone for the
  whole file, with several paths separated by `;`) and an `Approval:` line. `node scripts/correct.mjs --detect` then asks for the owner's disposition, as for any waiver.
- `scripts/check-specs.mjs` also checks the acceptance table of each active OpenSpec change, and in a pull request each
  slice proposal the branch adds, even an archived one: each named test must exist and must hold the quoted text.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a gate's problems, waivers and applicability, when its status is computed, then problems give FAIL, fully waived problems give WAIVED, a gate that does not apply gives N/A, and otherwise PASS | `scripts/pr-evidence.test.mjs` › "status: FAIL with problems, WAIVED when every problem is waived, N/A when the gate does not apply, PASS otherwise" |
| 2 | Given a branch that adds an OpenSpec slice with no acceptance table, or with criteria but no red then green TestRun (the #72 replay), when Red → green is checked, then it fails | `scripts/pr-evidence.test.mjs` › "red-green: an OpenSpec slice the branch adds with no acceptance table, or no red then green TestRun, fails (the #72 replay)" |
| 3 | Given an existing spec whose criterion the branch changes, when Red → green is checked, then that criterion needs a red then green TestRun and an unchanged one does not | `scripts/pr-evidence.test.mjs` › "red-green: a changed criterion of an existing spec needs new evidence; an unchanged one does not" |
| 4 | Given a branch with no new or changed criterion, when Red → green is checked, then the status is N/A, never PASS | `scripts/pr-evidence.test.mjs` › "red-green: a branch with no new or changed criterion is N/A, never PASS" |
| 5 | Given an open waiver the branch adds that names a criterion and an approval, when Red → green is checked, then that criterion shows WAIVED with the approval, and an unwaived criterion still fails | `scripts/pr-evidence.test.mjs` › "red-green: a criterion an open, approved waiver names is WAIVED; an unwaived one still fails" |
| 6 | Given a criterion that names a harness test, when Red → green is checked, then a harness TestRun of that file covers it | `scripts/pr-evidence.test.mjs` › "red-green: a harness test is covered by a harness TestRun of that file" |
| 7 | Given gates of each status, when the report is written, then each row says PASS, FAIL, N/A or WAIVED in its own words | `scripts/pr-evidence.test.mjs` › "the report shows PASS, FAIL, N/A and WAIVED in their own words" |
| 8 | Given an active OpenSpec change with an acceptance table, when the specs are validated, then a criterion that names a missing test, or quotes text its test lacks, fails | `scripts/check-specs.test.mjs` › "an active OpenSpec change's acceptance table names tests that exist and holds their quoted text" |
| 9 | Given a branch that adds a slice proposal already under archive/, when its specs are checked as a pull request, then a criterion that names a missing test fails | `scripts/check-specs.test.mjs` › "in a pull request, a slice proposal the branch adds is checked even when it is already archived" |

## Impact
- Affected specs: none. This is harness work with no FR rows, so the Factory chain does not apply. The evidence model is
  recorded in `docs/adr/0005-evidence-integrity.md`.
- Affected code: `scripts/pr-evidence.mjs`, `scripts/check-specs.mjs` (locked, so the lock is re-sealed), their tests,
  and the wording in `AGENTS.md`, `CLAUDE.md` and the `test-first-loop` skill. Because `AGENTS.md` and the skill change,
  the evals run again.
- Dependencies: none.
