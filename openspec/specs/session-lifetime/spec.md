# Session Lifetime Specification

## Purpose

Describes how the server session timeout is exposed to the browser and how the Angular client mirrors it: idle expiry,
renewal on activity, 401 and 403 handling, cross-tab behavior and protection against late responses. This is an
already-implemented baseline reverse-engineered from the shipped code and its tests; every requirement is an unratified
assumption. Sign-in, logout and password change are specified in `authentication`.

## Requirements

### Requirement: Session timeout header

Controller responses that have a body and are made with a session SHALL carry header `X-Session-Timeout-Seconds` equal
to the session's max inactive interval; responses without a session SHALL carry none, and no anonymous sessions SHALL
be created (FR-23). The server session inactivity timeout SHALL be 8 hours (`server.servlet.session.timeout: 8h`),
enforced by the server and mirrored in the browser from that header (NFR-3).

> GAP: no test pins the 8h value; the header following the session's interval is asserted (see docs/requirements.md Coverage gaps, NFR-3 row).

#### Scenario: Header follows the session interval
- **GIVEN** a signed-in session with a known max inactive interval
- **WHEN** a controller returns a body
- **THEN** `X-Session-Timeout-Seconds` equals that interval in seconds

#### Scenario: No session, no header, no new session
- **GIVEN** a request without a session
- **WHEN** a public endpoint responds
- **THEN** the response has no `X-Session-Timeout-Seconds` header and no session is created

### Requirement: Session cookie flags

The session cookie SHALL be `HttpOnly` and `SameSite=Strict`; the `Secure` flag SHALL NOT be set because the app is
served over plain HTTP on localhost (NFR-4).

> GAP: the cookie flags are not asserted by any test (see docs/requirements.md OQ-13 / Coverage gaps, NFR-4 row).

#### Scenario: Cookie attributes
- **WHEN** a login response sets the session cookie
- **THEN** the cookie has `HttpOnly` and `SameSite=Strict` and lacks `Secure`

### Requirement: Idle expiry without keep-alive

An idle page SHALL return to sign-in when the server timeout elapses, and the client SHALL send no keep-alive requests
(FR-24).

#### Scenario: Idle view cleared
- **GIVEN** a protected page open and no API activity
- **WHEN** the server timeout elapses
- **THEN** the view is cleared and the user is taken to sign-in
- **AND** no keep-alive request was sent

### Requirement: Activity renews the deadline across tabs

API activity SHALL renew the browser deadline, including activity in another tab sharing the session through the
`localStorage` key `flower-shop.session-expiry` (FR-25).

#### Scenario: Activity renews
- **WHEN** an API response arrives
- **THEN** the browser deadline is moved forward

#### Scenario: Activity in another tab
- **GIVEN** two tabs share the session
- **WHEN** the other tab records activity, even if its storage event is delayed
- **THEN** this tab uses the newer deadline

### Requirement: 401 on protected requests ends the session at once

A 401 on a protected request SHALL clear authentication immediately and redirect to `/login?sessionExpired=true`, which
shows "Your session has ended. Please sign in again." (FR-26).

#### Scenario: Rejected protected request
- **WHEN** a protected API request returns 401
- **THEN** authentication is cleared, the browser goes to `/login?sessionExpired=true`
- **AND** the login page shows "Your session has ended. Please sign in again."

### Requirement: Session check before writes

Before sending a write (non-GET) request, the client SHALL confirm the server session with `GET /api/auth/me` and check
its local deadline; if the session is gone it SHALL close the protected form and show no form error (FR-27).

#### Scenario: Expired timer not yet run
- **GIVEN** the local deadline has passed but the expiry timer has not run
- **WHEN** the user presses Save
- **THEN** nothing is sent and the view closes without a form error

#### Scenario: Session gone at pre-save check
- **GIVEN** the pre-save `/api/auth/me` call fails with 401
- **WHEN** the user presses Save on the material form
- **THEN** the form is removed and the browser goes to login

### Requirement: Route guard rechecks on every navigation

Protected child routes SHALL recheck authentication on each navigation: `authGuard` calls `/api/auth/me`, and a failure
redirects to `/login` (FR-28).

#### Scenario: Moving between pages
- **WHEN** the user navigates between protected child pages
- **THEN** `/api/auth/me` is called for each navigation and a failure redirects to `/login`

### Requirement: Recheck after a forbidden write

After a 403 on a write, the client SHALL recheck the session: redirect if the session is gone, keep the session on a
genuine permission or CSRF failure (FR-29).

#### Scenario: Session gone
- **WHEN** a write returns 403 and `/api/auth/me` then returns 401
- **THEN** the client redirects to login

#### Scenario: Genuine permission or CSRF failure
- **WHEN** a write returns 403 and `/api/auth/me` succeeds
- **THEN** the session is kept and the error is shown

### Requirement: Errors that do not end the session

Network errors, 5xx errors and wrong login credentials SHALL NOT end the session (FR-30).

#### Scenario: Server error
- **WHEN** a protected request fails with a network error or a 5xx status
- **THEN** the user stays signed in

#### Scenario: Wrong login credentials
- **WHEN** the login call returns 401 for wrong credentials
- **THEN** it is not treated as session expiry

### Requirement: Cross-tab sign-out and suspended tabs

Signing out in one tab SHALL clear protected views in other tabs, and a suspended tab whose deadline has passed SHALL be
cleared when it regains focus (FR-31).

#### Scenario: Other tab signs out
- **WHEN** another tab signs out
- **THEN** this tab clears its protected view

#### Scenario: Suspended tab regains focus
- **GIVEN** a tab whose deadline passed while it was suspended
- **WHEN** it regains focus
- **THEN** its view is cleared

### Requirement: Late responses cannot restore authentication

A response that arrives after sign-out or expiry SHALL NOT restore authentication or restart timers (FR-32).

#### Scenario: In-flight response after expiry
- **GIVEN** a request in flight when the session expires
- **WHEN** its response arrives
- **THEN** authentication stays cleared and no timer restarts
