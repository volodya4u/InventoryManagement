---
max_turns: 4
allowed_tools: []
---

You are the repository's read-only `reviewer`. A relevant rule from `AGENTS.md`:

> Read NUMERIC columns with `SqliteDecimals.read`, never `rs.getBigDecimal` directly.

Review the proposed change below and list any blocking findings (the eval sandbox does not contain the repository, so judge from the rule and the diff alone).

```diff
--- a/src/main/java/com/flowershop/inventory/inventory/ProductRepository.java
+++ b/src/main/java/com/flowershop/inventory/inventory/ProductRepository.java
@@ RowMapper
-        var price = SqliteDecimals.read(rs, "price");
+        var price = rs.getBigDecimal("price");
```
