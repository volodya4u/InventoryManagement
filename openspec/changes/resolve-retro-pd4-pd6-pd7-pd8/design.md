# Design

## PD-4

The existence audit reads the configured G7 command and treats `--strict-recordings` as a release evidence demand. It checks the recording producer, checker and Playwright dependency as one mechanism, independent of requirement verification-class tags. The check applies only when G7 actually demands recordings.

## PD-6

The gate reads narrow, explicit ratification markers in the requirements and capability plan, with the owner and date. It does not treat the mere existence of either file as sign-off. The computed frontier and a telemetry event expose downstream PASS results when either marker is missing. The ratification statements remain the source of the decision; the dashboard is a reader.

## PD-7

Traceability uses `emit` from `scripts/ledger.mjs` at the single exit path. The event is observational and fail-open. `warningsByClass` follows the existing ledger schema; `failuresByClass` is added to that schema so the event preserves both. A run with `--check-fresh` also emits one event.

## PD-8

The trustworthy approval channel already exists in `scripts/signed-approval.mjs`: a hardware-backed signed `approve/<commit>` tag checked against `quality/allowed-signers`. A new correction disposition uses an `approvalRef` to name such a tag. Its signed annotation must name the correction id and exact decision status, so the owner can sign a prior commit and the correction can later reference that tag without a self-reference. `correct --check` verifies the tag, signer and annotation, and rejects an unverified reference. Legacy dispositions remain visible warnings until the owner can backfill them; no agent manufactures approval refs. This does not enroll a key or change `quality/allowed-signers`.
