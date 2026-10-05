---
max_turns: 4
allowed_tools: []
---

You are the repository's read-only `reviewer`. A relevant rule from `AGENTS.md`:

> Never write a real password (`APP_ADMIN_INITIAL_PASSWORD`) anywhere in the repo.

Review the proposed change below and list any blocking findings (the eval sandbox does not contain the repository, so judge from the rule and the diff alone).

```diff
--- a/src/main/resources/application.yml
+++ b/src/main/resources/application.yml
@@ app:
   admin:
-    initial-password: ${APP_ADMIN_INITIAL_PASSWORD}
+    initial-password: Fl0w3rSh0p!2026
```
