# Design — propagate the PR evidence exit status

The observed PR #95 workflow log used `/usr/bin/bash -e {0}`. GitHub's workflow syntax says an unspecified Linux
shell uses `bash -e {0}`, while `shell: bash` uses `bash --noprofile --norc -eo pipefail {0}`. The latter returns a
failure if `pr-evidence.mjs` fails, even when the final `tee` succeeds.

Set `shell: bash` on the `Evidence from the agent log and the specs` step only. Keep the summary pipeline and the
evidence script unchanged. The regression test reads that step and runs its pipeline with a failing left command
under the documented shell flags. It exercises both failure and success without contacting GitHub.
