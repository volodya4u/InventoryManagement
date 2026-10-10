# Authentication Specification

## Purpose

Describes how the single `ADMIN` user signs in and out, how the CSRF token and the API access rule work, how the
password is changed, and how the first administrator is created at startup. This is an already-implemented baseline
reverse-engineered from the shipped code and its tests; every requirement is an unratified assumption until the product
owner signs off. Session lifetime in the browser is specified in `session-lifetime`.

## Requirements

### Requirement: Login endpoint

`POST /api/auth/login` with a non-blank `username` and `password` SHALL sign the user in and return `{username, role}`
with role `ADMIN` (FR-1).

#### Scenario: Valid credentials sign the administrator in
- **GIVEN** an administrator exists with a known password
- **WHEN** a client posts `{username, password}` to `/api/auth/login` with a valid CSRF token
- **THEN** the response is successful and the body contains the username and role `ADMIN`
- **AND** later `/api/**` calls with the session cookie are authorized

### Requirement: Case-insensitive usernames

Username matching SHALL be case-insensitive because `app_user.username` is `COLLATE NOCASE` and unique (FR-2).

> GAP: no test asserts case-insensitive matching (see docs/requirements.md Coverage gaps, FR-2 row).

#### Scenario: Username differing only by case
- **GIVEN** an administrator named `admin`
- **WHEN** a client signs in as `ADMIN` with the correct password
- **THEN** the schema collation resolves it to the same user row (code-level behavior, not test-verified)

### Requirement: Single failure message for rejected credentials

A wrong password, an unknown username or a disabled user SHALL be rejected with HTTP 401 and the single message
"Invalid username or password" (FR-3).

> GAP: the message text and the disabled-user branch are not asserted by any test; only the 401 for an old password is
> asserted (see docs/requirements.md Coverage gaps, FR-3 row).

#### Scenario: Wrong password
- **GIVEN** an administrator exists
- **WHEN** a client posts the wrong password
- **THEN** the response status is 401
- **AND** the message is "Invalid username or password" whether the username was unknown, the password wrong or the user disabled

### Requirement: API access rule

Every `/api/**` path except `/api/auth/login`, `/api/auth/csrf`, `/api/health` and `/error` SHALL require role `ADMIN`
(FR-4).

> GAP: the 403 path and the JSON bodies are not asserted; only the 401 status is (see docs/requirements.md Coverage gaps, FR-4 row).

#### Scenario: Unauthenticated call
- **GIVEN** no session
- **WHEN** a client calls a protected `/api/**` path
- **THEN** the response is 401 with body `{"message":"Authentication required"}`

#### Scenario: Authenticated without the role
- **GIVEN** a session whose user lacks role `ADMIN`
- **WHEN** it calls a protected `/api/**` path
- **THEN** the response is 403 with body `{"message":"Access denied"}`

#### Scenario: Public paths
- **GIVEN** no session
- **WHEN** a client calls `/api/auth/csrf` or `/api/health`
- **THEN** the call is not rejected for authentication

### Requirement: CSRF token endpoint and header

`GET /api/auth/csrf` SHALL return `{token, headerName}` and set the `XSRF-TOKEN` cookie, which the client echoes in
header `X-XSRF-TOKEN` (FR-5). CSRF protection SHALL use that cookie token and header on all state-changing requests (NFR-5).

#### Scenario: Token obtained and used
- **GIVEN** a client without a token
- **WHEN** it calls `/api/auth/csrf` and then sends a write request with header `X-XSRF-TOKEN`
- **THEN** the write request is accepted (this positive path is used by every integration write test)

### Requirement: Missing CSRF token is rejected

A state-changing request without a valid CSRF token SHALL be rejected with 403 (FR-6).

> GAP: only the positive path is exercised; no test sends a write without the token (see docs/requirements.md Coverage gaps, FR-6 and NFR-5 rows).

#### Scenario: Write without token
- **GIVEN** a signed-in session
- **WHEN** a write request omits `X-XSRF-TOKEN`
- **THEN** the response status is 403

### Requirement: Current user endpoint

`GET /api/auth/me` SHALL return the signed-in user, or 401 when there is no session (FR-7).

#### Scenario: Me with and without a session
- **GIVEN** a signed-in session
- **WHEN** the client calls `/api/auth/me`
- **THEN** the signed-in user is returned
- **AND** without a session the same call returns 401

### Requirement: Logout endpoint

`POST /api/auth/logout` SHALL return 204 and invalidate the server session (FR-8).

> GAP: no backend test covers logout (see docs/requirements.md Coverage gaps, FR-8 row).

#### Scenario: Logout ends the session
- **GIVEN** a signed-in session
- **WHEN** the client posts to `/api/auth/logout`
- **THEN** the response is 204
- **AND** the session is invalidated

### Requirement: Sign out action in the shell

The Sign out action SHALL call logout once, clear local session state and go to `/login`, even when the logout call
fails (FR-9).

#### Scenario: Sign out succeeds
- **WHEN** the user chooses Sign out
- **THEN** logout is called once, local session state is cleared and the app navigates to `/login`

#### Scenario: Sign out request fails
- **GIVEN** the logout call fails
- **WHEN** the user chooses Sign out
- **THEN** the app still clears local state and navigates to `/login`

### Requirement: Password change validation

`POST /api/auth/change-password` SHALL reject a wrong current password with 400 "Current password is incorrect" (FR-10),
a new password outside 10 to 64 characters with 400 "New password must be between 10 and 64 characters" (FR-11), a
confirmation that differs from the new password with 400 "New password confirmation does not match" (FR-12), and a new
password equal to the current one with 400 "New password must be different from current password" (FR-13).

> GAP: the server-side mismatched-confirmation rejection is covered only by a client test, and the "must be different"
> rule has no test (see docs/requirements.md Coverage gaps, FR-12 and FR-13 rows).

#### Scenario: Wrong current password
- **WHEN** the current password sent is wrong
- **THEN** the response is 400 with "Current password is incorrect"

#### Scenario: New password too short or too long
- **WHEN** the new password has 9 characters, or 65 characters
- **THEN** the response is 400 with "New password must be between 10 and 64 characters"

#### Scenario: Confirmation mismatch
- **WHEN** the confirmation differs from the new password
- **THEN** the response is 400 with "New password confirmation does not match"

#### Scenario: Same password
- **WHEN** the new password equals the current one
- **THEN** the response is 400 with "New password must be different from current password"

### Requirement: Password policy limits

The policy for a changed password SHALL be length 10 to 64 and different from the current password, with no complexity
classes, no reuse history and no breach check; the bootstrap password is not checked against the policy (NFR-1).

> GAP: the difference rule and the bootstrap-password exemption are not asserted (see docs/requirements.md OQ-7 / Coverage gaps).

#### Scenario: Policy has no complexity rule
- **WHEN** a new password of 10 characters that is all lowercase letters is sent with a correct current password
- **THEN** the length and complexity checks do not reject it (code-level behavior)

### Requirement: Successful password change ends all sessions

A successful password change SHALL return 204, store a new bcrypt hash, expire every session of that user, answer later
calls on those sessions with 401 "Your session has ended. Please sign in again.", and allow only the new password to
sign in afterwards (FR-14). A new session identifier SHALL be issued at login and a password change SHALL expire all
sessions of the user (NFR-7).

> GAP: the identifier change at login is not asserted (see docs/requirements.md Coverage gaps, NFR-7 row).

#### Scenario: Other browser session is ended
- **GIVEN** two signed-in sessions of the administrator
- **WHEN** one of them changes the password successfully
- **THEN** the response is 204
- **AND** the other session's next protected call returns 401 "Your session has ended. Please sign in again."
- **AND** signing in with the old password fails, signing in with the new password succeeds

### Requirement: Password change UI flow

After a successful change the UI SHALL end the session and show the login page with "Password changed successfully.
Sign in with your new password." (FR-15). When the change fails, the UI SHALL show the server error and keep the
session (FR-16).

#### Scenario: Success
- **WHEN** the change-password form is submitted and the server accepts it
- **THEN** the session is ended and the login page shows "Password changed successfully. Sign in with your new password."

#### Scenario: Failure
- **WHEN** the server rejects the change
- **THEN** the form shows the server error and the user stays signed in

### Requirement: Passwords stored as bcrypt and masked in logs

Passwords SHALL be stored only as bcrypt hashes with cost factor 12 (`BCryptPasswordEncoder(12)`), never in plain text,
and the repository holds no default password (NFR-2). The `toString()` of the login and change-password requests SHALL
print `[PROTECTED]` instead of the password (NFR-8).

> GAP: the cost factor 12 is not asserted; the unit test uses a mock encoder (see docs/requirements.md Coverage gaps, NFR-2 row).

#### Scenario: Password masked in request logging
- **WHEN** a login or change-password request object is converted to a string
- **THEN** the password appears as `[PROTECTED]`

### Requirement: No throttling, single role

The system SHALL NOT throttle logins, lock accounts or offer multi-factor sign-in, and SHALL offer no emailed or
expiring links (no password reset, no invitations) (NFR-10). Authorization SHALL have the single role `ADMIN` and allow
unlimited concurrent sessions per user (NFR-11).

> GAP: these are absences with no guard test (see docs/requirements.md OQ-6 / Coverage gaps, NFR-10 and NFR-11 rows).

#### Scenario: Repeated failed logins
- **WHEN** a client sends many wrong passwords in a row
- **THEN** each attempt is answered independently with 401 and the account is not locked

### Requirement: Administrator bootstrap on startup

In profile `local`, if no user named `APP_ADMIN_INITIAL_USERNAME` (default `admin`) exists, startup SHALL create one
`ADMIN` with the bcrypt hash of `APP_ADMIN_INITIAL_PASSWORD` (FR-17). If no administrator exists and the password
variable is blank, startup SHALL fail with an error naming that variable and no default password SHALL exist (FR-18).
When the administrator already exists, startup SHALL leave the user and password untouched (FR-19).

#### Scenario: Missing administrator is created
- **GIVEN** no user with the configured username and a non-blank initial password
- **WHEN** the application starts in profile `local`
- **THEN** one `ADMIN` is inserted with the hashed password

#### Scenario: Blank initial password
- **GIVEN** no administrator and a blank `APP_ADMIN_INITIAL_PASSWORD`
- **WHEN** the application starts
- **THEN** startup fails with an error naming `APP_ADMIN_INITIAL_PASSWORD`

#### Scenario: Existing administrator
- **GIVEN** the administrator already exists
- **WHEN** the application starts
- **THEN** the existing user and password hash are unchanged

### Requirement: Login form behavior

The login form SHALL pre-fill username `admin`, send the trimmed username and never send an empty password (FR-20). A
failed sign-in SHALL show the server's reason and stay on the login page (FR-21). The password field SHALL have a reveal
toggle that hides the password again after 5 seconds (FR-22).

#### Scenario: Trimmed username
- **WHEN** the user enters " admin " and a password and submits
- **THEN** the request carries `admin` and the app opens the dashboard on success

#### Scenario: Empty password
- **WHEN** the password field is empty
- **THEN** no login request is sent

#### Scenario: Failed sign-in
- **WHEN** the server rejects the credentials
- **THEN** the page shows the server's reason and stays on `/login`

#### Scenario: Reveal toggle
- **WHEN** the user toggles the password reveal
- **THEN** the password is visible and hides again after 5 seconds
