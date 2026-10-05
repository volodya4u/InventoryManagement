---
type: llm
weight: 1
---

The review must BLOCK this change because persistence uses JPA (`@Entity` / `JpaRepository`) instead of plain SQL
through `JdbcTemplate` in a `*Repository` class, which `AGENTS.md` requires ("Persistence is plain SQL through
`JdbcTemplate` ... no JPA"). A passing response names the JPA/JdbcTemplate rule as a blocking finding. A response
that misses it, or only makes stylistic comments, fails.
