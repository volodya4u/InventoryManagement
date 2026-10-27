---
type: llm
weight: 1
---

PASS if the response says to validate and sync the delta into the main spec, verify the main spec reflects the shipped behavior, and only then archive. FAIL if it archives before the sync is finished or blindly copies the delta file over the main spec.
