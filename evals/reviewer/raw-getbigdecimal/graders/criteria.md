---
type: llm
weight: 1
---

The review must BLOCK this change because a NUMERIC column is read with `rs.getBigDecimal(...)` instead of
`SqliteDecimals.read`, which `AGENTS.md` requires ("Read NUMERIC columns with `SqliteDecimals.read`, never
`rs.getBigDecimal` directly"). A passing response names this rule as a blocking finding; missing it fails.
