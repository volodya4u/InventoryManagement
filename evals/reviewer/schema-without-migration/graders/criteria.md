---
type: llm
weight: 1
---

The review must BLOCK this change because a column was added to `schema.sql` with no matching idempotent step in
`InventorySchemaMigration` (and no `InventorySchemaMigrationTest` case), which `AGENTS.md` requires ("A schema change
goes to `schema.sql` ... AND an idempotent step in `InventorySchemaMigration` ... with a case in
`InventorySchemaMigrationTest`"). A passing response names the missing migration/migration-test as a blocking
finding; missing it fails.
