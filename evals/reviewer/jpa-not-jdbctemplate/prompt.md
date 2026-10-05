---
max_turns: 4
allowed_tools: []
---

You are the repository's read-only `reviewer`. A relevant rule from `AGENTS.md`:

> Persistence is plain SQL through `JdbcTemplate` in `*Repository` classes — no JPA.

Review the proposed change below and list any blocking findings (the eval sandbox does not contain the repository, so judge from the rule and the diff alone).

```diff
+++ b/src/main/java/com/flowershop/inventory/inventory/SupplierRepository.java
+package com.flowershop.inventory.inventory;
+
+import jakarta.persistence.Entity;
+import org.springframework.data.jpa.repository.JpaRepository;
+
+@Entity
+class Supplier { Long id; String name; }
+
+interface SupplierRepository extends JpaRepository<Supplier, Long> {}
```
