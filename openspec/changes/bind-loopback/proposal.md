# Bind the server to 127.0.0.1 in the local profile

## Why

The documents call the application local-only (BC-5, TC-4, OQ-6, OQ-13), but nothing enforced it. `application-local.yml` sets
only `server.port: 8081`; with no `server.address`, Spring Boot listens on every network interface. Any device on the same
network could reach the sign-in page, and the application has no login throttling (NFR-10). Risk R-09 in
`docs/qa/risk-register.md` recorded this as an owner decision. The owner approved the bind on 2026-10-30 (chat) and asked for it
as its own pull request.

## What Changes

- **`src/main/resources/application-local.yml`**: `server.address: 127.0.0.1` next to the port. The test profile is untouched.
- **`frontend/proxy.conf.json`** and **`Start OnlineStore.cmd`**: they used `localhost`, which can resolve to `::1` (IPv6) first;
  the server now listens on IPv4 loopback only, so they use `127.0.0.1` (the launcher's "already running?" port check and the
  URL it opens; the dev proxy target).
- **New requirement NFR-23** (`docs/requirements.md`, `local-verifiable`) and TC-4 updated; the baseline spec
  `openspec/specs/app-shell-routing/spec.md` says the same and gains a scenario. Overriding the bind (`SERVER_ADDRESS`) is a
  deliberate act and first needs the answer to OQ-13 (HTTPS, the `Secure` cookie).
- **Documents**: README, risk R-09 and R-10, the manual test plan (case MT-29, from a second device) and the acceptance report.
- **`LoopbackBindingHttpTest`** (new): a real embedded server on the `local` profile.
- Not changed: login throttling (OQ-6), HTTPS and the `Secure` cookie (OQ-13), the port, the database, the test profile.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given the application started with the default `local` profile, when a client connects to `127.0.0.1` on the server port, then the connection is accepted, and `server.address` is `127.0.0.1` | `LoopbackBindingHttpTest` › `listensOnTheLoopbackAddressInTheLocalProfile` |
| 2 | Given the same server, when a client connects to this machine's own non-loopback IPv4 address on the server port, then no connection is made (refused, or dropped so that the attempt times out) | `LoopbackBindingHttpTest` › `refusesConnectionsOnTheMachinesOtherAddresses` |

## Impact

- Affected files: `src/main/resources/application-local.yml`, `src/test/java/com/flowershop/inventory/LoopbackBindingHttpTest.java`,
  `frontend/proxy.conf.json`, `Start OnlineStore.cmd`, `README.md`, `docs/requirements.md`, `openspec/specs/app-shell-routing/spec.md`,
  `docs/qa/{risk-register,manual-test-plan,mvp-acceptance-report}.md`, `docs/autonomy-log.md`, this change folder.
- A person who browses to the application from another device loses that access, by design. `SERVER_ADDRESS=0.0.0.0` restores
  it on purpose. A browser tab on `localhost` keeps working: browsers fall back from `::1` to `127.0.0.1`.
- Rollback: revert the one commit; no data or schema change.
