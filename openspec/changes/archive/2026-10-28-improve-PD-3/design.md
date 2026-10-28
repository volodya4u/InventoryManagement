# Design — improve-PD-3

## Two numbers that disagreed with the files
`covered` was `tested + waived`, so a waived requirement looked proven. And `Waivers` counted the contracts the last acceptance
run happened to mark waived, not the waiver files, so it changed with the mode of that run.

## Additive, because the ratchet reads `covered`
`check-process-ratchet.mjs` guard 3 compares `acceptanceCoverage.covered / declared` with `quality/process-baseline.json`
(169 / 169). If `covered` dropped to the tested count, the ratchet would fail on a state that has not changed. So the digest
keeps `covered` and `declared`, and adds `tested`, `waived` and `uncovered` next to them. A waived contract stays visible as
waived; the ratchet's meaning is untouched.

## Waiver files are the source of truth
A waiver is a file the owner approved, so the file count is the number to show. The status rule is the one
`check-acceptance-methods.mjs` applies (the first `Status:` or `State:` line; closed-class values do not suppress; no status
means open). It is mirrored here, not imported, because that script is locked and runs its checks on import.
`contractWaivers` stays in the digest as information.
