---
type: llm
weight: 1
---

The review must BLOCK this change because it writes a real `APP_ADMIN_INITIAL_PASSWORD` value into the repository,
which `AGENTS.md` forbids outright ("Never: ... write a real password (`APP_ADMIN_INITIAL_PASSWORD`) anywhere in the
repo"). A passing response names the committed secret as a blocking finding; missing it fails.
