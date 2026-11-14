# ADR 003: Lock an account after 5 failed attempts; unlock with a single-use emailed link

- **Status:** Proposed. The team README holds unlocking "until the team decides who unlocks and how".
- **Owner:** Tyler Gaines.
- **Traces:** SE-FR-11, SE-NFR-06, UC-08, UC-09, UC-10, UC-11.

## Context

Tyler's diagrams have an administrator unlock a locked account. The class diagram (`User.unlockAccount(token)`), the Physical view (unlock-account emails) and the Architecture diagram (`auth-guard`) use an emailed token. No source gives the threshold, the lock duration or the rate limit.

## Decision

| Setting | Value | Where to change |
| --- | --- | --- |
| Failed attempts before lock | 5 (wrong password or wrong 2FA code) | `LOCKOUT_THRESHOLD` |
| Lock duration | 30 minutes, then the count starts again from 0 | `LOCKOUT_MINUTES` |
| Per-address rate limit | 5 requests per 60 seconds, then HTTP 429 "Try again later" | `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS` |
| Rate-limited endpoints | sign-up, log-in, 2FA check, reset request, reset confirm | `rate_limited_paths` in `core/config.py` |
| Unlock link lifetime | 24 hours, single use | `UNLOCK_TOKEN_MINUTES` |
| Reset link lifetime | 30 minutes, single use | `RESET_TOKEN_MINUTES` |

- **Who unlocks:** the account holder, with the link emailed when the lock happens. There is no administrator role in the system; adding one is a later, separate decision.
- **Order of checks at log-in (UC-09):** rate limit, then "is the account locked?" (HTTP 423), then the password. A locked account is refused even with the right password.
- **Counting is atomic.** The account row is locked for the duration of an attempt and the counter is incremented by the database, so parallel guesses cannot exceed 5. Exactly one unlock email is sent per lock.
- **Unlock and reset are separate (UC-11).** The unlock link clears the lock and never changes the password. The reset link changes the password and never clears a lock. The two tokens are different kinds and are not interchangeable.
- **Links work once.** Each carries a 256-bit random id (`secrets.token_urlsafe(32)`) that is stored on the account and erased on use. A newer link replaces an older one.
- **Tokens:** HS256 only; a token naming any other algorithm (including `none`) is rejected. Sessions travel only in the `Authorization: Bearer` header, never in a URL or cookie.
- **A password change ends every earlier session**, including open live-update connections.
- **No account enumeration:** unknown email and wrong password give the same 401; the reset request always gives the same 200.
- **The limiter's memory is bounded:** at most 10,000 addresses of 5 timestamps each, and expired entries are swept on every request.

## Demo mode

With `DEMO_MODE=true` (the default outside production) emails go to an in-app "dev outbox", the 2FA code `123456` is accepted, and the role switcher signs in without a password. All three are off when `DEMO_MODE=false`. Never deploy with demo mode on.

## How it is verified

`test_uc08_uc09_auth_lockout_and_rate_limit_uc10_uc11_se_fr11`, `test_uc09_failed_attempts_are_counted_atomically_and_lock_at_five_uc10` (12 parallel guesses on PostgreSQL: exactly 5 are checked), `test_uc10_uc11_reset_and_unlock_links_are_single_use_and_strictly_separate_se_fr11`, `test_se_nfr06_jwt_accepts_only_hs256_tokens_of_the_right_kind_se_fr11`, `test_uc08_rate_limiter_memory_stays_bounded_under_spoofed_addresses_uc09`.

## Open points for sign-off

- Accept "unlock by emailed link" over "administrator unlocks", and redraw the Log in diagrams to match.
- Confirm 5 attempts / 30 minutes / 5 requests per minute.
- The rate limit is per server process. Running several API processes needs a shared store (for example Redis).
