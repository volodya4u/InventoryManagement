# Design — improve-PD-1

## What the product-code answer controls
`ledger-report.mjs` uses `productCodePresent()` in three places: the `productCodePresent` field of
`trace/process-health.json`, the result for an empty ledger (`NOT-EARNED`, exit 1, with product code; `SKIP-pending`, exit 0,
without), and the deterministic fallback defect for an empty ledger. It does not decide the vacuous-pass count: that filter
reads each event's `meta.productCode`, which `gate-status.mjs` already writes from its own rule. So the visible harm is on a
clone with no ledger, where the digest exited 0 and called this codebase "pre-build".

## Why mirror the rule and not share it
`gate-status.mjs` defines `hasProductCode()` inline and runs its checks at import time, so another script cannot import it.
Sharing would mean moving it into a module and changing `gate-status.mjs`, a locked file, which needs its own approved
defect id and a re-seal. Mirroring keeps this change to one unlocked file. The drift risk that a copy brings is closed by a
test, not by a comment: criterion 3 runs both scripts on the same trees and compares `productCodePresent` with the
`productCode` that `gate-status.mjs` records in its ledger event.

## Why gate-status's rule and not the process ratchet's
ADR-0008 gave `check-process-ratchet.mjs` its own list with `frontend/src`. `gate-status.mjs` finds this repository's code
through `src/` already, and it is the rule that writes `meta.productCode` into the ledger that this digest reads, so
agreeing with it keeps the digest and its input consistent. Folding the three detectors into one is a change to two locked
files and is left to a later defect.

## Test fixtures
Each test builds a throwaway project under the OS temp directory. The comparison runs the repository's `gate-status.mjs`
with the fixture as working directory: its checks are spawned from `scripts/` under that directory, which does not exist
there, so they fail fast and only the ledger event matters. The test clears `FACTORY_TELEMETRY` for that run, because the
git hooks set it to `off`, and an `off` run writes no ledger event to compare with.
