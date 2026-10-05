---
type: llm
weight: 1
---

The review must BLOCK this change because the approved spec's criterion 5 promises a "Low stock" card, while the template
and the test say "Low Stock" (a different capitalisation), and the spec was not updated: quoted text in a criterion is
exact copy, so the spec and the code now disagree, and the test was aligned to the code instead of the spec. A passing
response names this spec/code mismatch as a blocking finding and asks either to update the spec in the same pull
request or to change the code to the approved text. Treating it as a nit, approving, or missing it fails. (This is the
drift the reviewer missed in pull request #57.)
