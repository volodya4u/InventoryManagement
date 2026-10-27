# Design — harden-frontend-specs

> Reconstructed on 2026-10-27. The slice was archived without a `design.md`. This file is written from its
> `proposal.md`, `tasks.md` and the merged commit 863b6b5 (pull request #69, branch `claude/harden-frontend-specs`); it
> records what that diff shows and nothing the original author did not save. See `docs/qa/historical-gaps.md`.

## Approach
Test-only (slice H6). Vitest specs, each new test tagged `@trace <id>`, in:
- `core/image-file.spec.ts` — the client-side image check (FR-75);
- `app.routes.spec.ts` — the route table behind `authGuard`, the `/dashboard` redirects, and the guard sending an
  unauthenticated user to `/login` (FR-34);
- the raw material and product component specs — delete confirmation: declined sends nothing, confirmed deletes and
  removes the row (FR-55, FR-86, NFR-19);
- the monthly sales report spec — the sale-number link (FR-146) and the UAH display with two decimals and no currency
  code shown (NFR-21, NFR-22).

## Narrowed, not closed
NFR-19, NFR-21 and NFR-22 stayed PARTIAL with a narrower gap; the API side of NFR-22 is not a frontend property and stayed
open. The later `nfr-evidence-hardening` change closed them.

## Red evidence
Task 6 shows each new spec failing against a deliberately broken production input through `node scripts/test-run.mjs`,
then reverts it; the final diff touches no production file.

## What this slice did not leave behind
The commit carries no `Slice:` trailer, so the trajectory check could not find the reviewer verdicts that its log lines
do hold (see `review-findings.json` in this folder). The missing trailer is recorded in `docs/qa/historical-gaps.md`; it
cannot be repaired without rewriting history.
