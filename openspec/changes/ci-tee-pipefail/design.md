# Design — propagate every tee step's exit status

GitHub's workflow syntax says an unspecified Linux shell uses `bash -e {0}`, while `shell: bash` uses
`bash --noprofile --norc -eo pipefail {0}`; `defaults.run.shell` at the workflow level sets the latter for every
`run` step that names no shell of its own. A workflow-level default covers the two `build-and-test` steps PR #96's
reviewer found and any `| tee` step added later, and it leaves the step-level `shell: bash` of the evidence step
redundant, so that line goes. Every other step already fails on its first failing command under `-e`, and none relies
on a failing pipe being ignored, so `pipefail` changes nothing else.

The regression test reads `ci.yml` without a YAML dependency: it splits the jobs and steps by their indentation, takes
each step's `run` (block or inline) and resolves its shell in GitHub's order: the step's `shell`, its job's
`defaults.run.shell`, then the workflow's. A shell other than Bash fails the test instead of being modelled. A
pipeline continued over several lines with `\` is not recognised; `ci.yml` has none. For each line that pipes into `tee`, it replaces the left command with `(exit 17)` and with
`(exit 0)`, keeps the real `tee` and its target, and runs it under the resolved flags with `GITHUB_WORKSPACE` and
`GITHUB_STEP_SUMMARY` pointed at a temporary directory. It also requires the three known `tee` steps to be found, so a
parsing slip cannot turn the test vacuous. A second test feeds the resolver synthetic workflows (workflow, job and step
shells, a job default of `sh`, an unspaced `|tee`), because after the change `ci.yml` itself exercises only the
workflow default.
