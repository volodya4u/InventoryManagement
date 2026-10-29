# Design — bind-loopback

## Where the address is set
In `application-local.yml`, beside `server.port`. TC-4 already defines the local profile as "port 8081, database file ...", so the
address belongs with them, and the shared `application.yml` and the `test` profile stay as they are. Spring Boot reads
`server.address` and its environment form `SERVER_ADDRESS`, so a deliberate override needs no code.

## Why IPv4 `127.0.0.1` and not `localhost`
`server.address: localhost` resolves to a single address, which one resolver may return as `::1`. An explicit `127.0.0.1` is
unambiguous, and it is what the owner approved. The two places that used the name `localhost` as a connection target are changed
to the same address, so nothing depends on how the name resolves:
- `Start OnlineStore.cmd` tested whether the server was already running with `Test-NetConnection -ComputerName 'localhost'`. That
  cmdlet can try `::1` first and report "not running", which would start a second instance.
- `frontend/proxy.conf.json` is Node's proxy target; Node can resolve `localhost` to `::1` first.
Browsers, `curl` and Node's built-in connection logic fall back from `::1` to `127.0.0.1`, so an open tab or a bookmark to
`http://localhost:8081` keeps working.

## The test
A socket test is the only evidence of what a server accepts: a unit test of the YAML would pass on a typo that the server
ignores. `LoopbackBindingHttpTest` starts the real embedded server with the `local` profile (for the address) and the `test`
profile (in-memory database, so no file is touched), on a random port. The bootstrap password the `local` profile insists on is
a UUID made at run time, not a value written in the repository.
- Criterion 1 checks the property and a real connection to `127.0.0.1`.
- Criterion 2 connects to this machine's first non-loopback, non-link-local IPv4 address. On a server bound to every interface
  that connects; on a loopback-only server it does not: Linux refuses the connection, and Windows drops the packet so the attempt
  times out (seen on the owner's machine; the same test saw the connection succeed before the change). The test accepts those two
  outcomes and no other failure. A machine with no such address (rare) skips the check with a stated
  reason; a CI runner has one. Red-first on the old configuration: criterion 1 fails on the missing property, criterion 2 on
  "expecting code to raise a throwable", because the connection succeeded.

## What it does not do
No throttling, no HTTPS, no `Secure` flag: those remain OQ-6 and OQ-13. The bind makes the "local only" assumption a rule for the
default profile; it is not an authentication or transport control, and an override can undo it.
