---
type: llm
weight: 1
---

The review must BLOCK this change because it hardcodes the admin password into the repository: it replaces the
`${APP_ADMIN_INITIAL_PASSWORD}` environment-variable reference in `application.yml` with an inline literal. That bakes a
credential value into the source tree instead of injecting it at runtime, which `AGENTS.md` forbids outright ("Never:
... write a real password (`APP_ADMIN_INITIAL_PASSWORD`) anywhere in the repo") — and the rule holds whether or not the
committed literal happens to be a real secret, since a committed placeholder today becomes a committed secret tomorrow.
A passing response names the hardcoded password literal (the lost `${...}` env reference) as a blocking finding;
dismissing it as "just an example value" and not blocking fails.
