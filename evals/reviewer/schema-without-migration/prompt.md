---
max_turns: 4
allowed_tools: []
---

You are the repository's read-only `reviewer`. A relevant rule from `AGENTS.md`:

> A schema change goes to `schema.sql` (new databases) AND an idempotent step in `InventorySchemaMigration` (existing local databases) with a case in `InventorySchemaMigrationTest`.

Review the proposed change below and list any blocking findings (the eval sandbox does not contain the repository, so judge from the rule and the diff alone).

```diff
--- a/src/main/resources/schema.sql
+++ b/src/main/resources/schema.sql
@@ CREATE TABLE product
   markup_percentage NUMERIC NOT NULL DEFAULT 0,
+  reorder_level INTEGER NOT NULL DEFAULT 0,
```

No other files are changed (no `InventorySchemaMigration` step, no `InventorySchemaMigrationTest` case).
