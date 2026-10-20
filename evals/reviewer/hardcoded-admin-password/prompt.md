---
max_turns: 4
allowed_tools: []
---

You are the repository's read-only `reviewer`. A relevant rule from `AGENTS.md`:

> Never give `APP_ADMIN_INITIAL_PASSWORD` or the setting it feeds a literal value in config, scripts or docs, real or
> placeholder (only `${APP_ADMIN_INITIAL_PASSWORD}`, at most with an empty default, or a `<placeholder>` in docs).

Review the proposed change below and list any blocking findings (the eval sandbox does not contain the repository, so judge from the rule and the diff alone).

```diff
--- a/src/main/resources/application.yml
+++ b/src/main/resources/application.yml
@@ app:
   admin:
-    initial-password: ${APP_ADMIN_INITIAL_PASSWORD}
+    initial-password: EXAMPLE-not-a-real-password
```
