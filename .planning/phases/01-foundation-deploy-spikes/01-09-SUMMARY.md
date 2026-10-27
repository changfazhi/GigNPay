---
phase: 01-foundation-deploy-spikes
plan: 09
subsystem: ui
tags: [better-auth, next16, shadcn, proxy, dashboard, heartbeat]
requires: [01-04, 01-05, 01-08]
provides:
  - src/web/actor.ts (Actor, getActor)
  - GET /api/me (401 without session, caller's own id/email/name/role/paypalEmail with one)
  - src/lib/auth-client.ts (authClient, signIn, signUp, signOut)
  - Pages /signup, /login, /dashboard (role card plus worker-status section), / (landing)
  - SiteHeader (with demo-switcher slot), SignOutButton, SignupForm, LoginForm
  - src/proxy.ts (optimistic redirect, matcher /dashboard and /spikes)
affects: [01-10, 01-13]
tech-stack:
  added: []
  patterns: [getActor() with disableCookieCache for DB-checked sessions, web-only helpers in src/web, optimistic proxy plus per-page session check]
key-files:
  created:
    - src/web/actor.ts
    - src/app/api/me/route.ts
    - src/lib/auth-client.ts
    - src/app/(auth)/signup/page.tsx
    - src/app/(auth)/signup/signup-form.tsx
    - src/app/(auth)/login/page.tsx
    - src/app/(auth)/login/login-form.tsx
    - src/app/dashboard/page.tsx
    - src/components/site-header.tsx
    - src/components/sign-out-button.tsx
    - src/proxy.ts
  modified:
    - src/app/layout.tsx
    - src/app/page.tsx
key-decisions:
  - "Dashboard uses notFound() (not a second redirect) when the session user's row is missing, keeping exactly one redirect(\"/login\") as the acceptance criteria require"
  - "Header demo-switcher slot is an empty div with id header-demo-slot inside the right-hand group for plan 01-13"
requirements-completed: [AUTH-01, AUTH-03]
duration: ~15min
completed: 2026-10-27
status: complete
---

# Phase 1 Plan 09: Sign-up, login, dashboard, header and proxy Summary

Better Auth sign-up (role radio, worker-only PayPal email, judge code header), login, sign-out, a server-rendered role dashboard that reads the caller's own Postgres row plus worker heartbeat age, `/api/me`, and an optimistic `proxy.ts` redirect, all on plain shadcn components.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Sign-up, login, /api/me and the role dashboard | 43e7fdd |
| 2 | Site header with sign-out, landing page, layout and proxy | a061782 |

## Verification

- `npm run test` (7 files, 63 tests), `npm run typecheck`, `npm run lint` and `npm run build:check` all exit 0 after each task. The build lists `/`, `/api/me`, `/dashboard`, `/login`, `/signup`, `/api/health`, `/api/auth/[...all]` as dynamic routes plus `Proxy (Middleware)`.
- Greps: `paypalEmail` in signup-form 6, `x-judge-signup-code` 1, `value="admin"` 0, `redirect("/login")` in dashboard 1, `getWorkerStatus` in dashboard present, `status: 401` in /api/me 1, `export function proxy` 1, `SiteHeader` in layout 2, `signOut` in sign-out-button 2. `grep -rlE "from ['\"]next/" src/server` prints nothing.
- Every route used by `tests/smoke/skeleton.smoke.test.ts` now exists: `/api/auth/sign-up/email`, `/api/auth/sign-in/email`, `/api/me`, `/dashboard`, `/api/health`. The `/api/me` shape is `{ id, email, name, role, paypalEmail }` (paypalEmail null when unset), and the dashboard HTML contains the user email and, for workers, the PayPal email.

## Not verified locally

There is no local Postgres. The sign-up insert, sign-in, `/api/me` with a real session, the dashboard row read and the worker-status read are proven only by the named live-DB check in plan 01-10 Task 3. No browser check of the 375 px layout was made; the layout is single column with `break-words` on the email and PayPal email and a wrapping header.

## Deviations from Plan

**1. [Minor] Dashboard missing-row handling.** The plan says `redirect("/login")` when the actor is null; the acceptance criterion also requires exactly one such call. For the case where a valid session exists but the user row is gone, I used `notFound()`.

**2. [Minor] `proxy.ts` also checks the path prefix in code** in addition to `config.matcher`, to match the plan text literally. Behaviour is identical.

**3. [Minor] `getActor()` and `/api/me` pass `query: { disableCookieCache: true }`** to `getSession` so sessions are always validated against the database (plan: "no cookie cache").

## Known Stubs

None. The `header-demo-slot` div is an intentional empty slot for plan 01-13.

## Threat Flags

None beyond the plan's threat model. T-01-09-01 (session check in page and route, proxy only optimistic), T-01-09-02 (/api/me takes no id parameter, returns session user's fields only) and T-01-09-03 (judge code only sent as the `x-judge-signup-code` header, only when typed) are implemented as planned.

## Notes for later plans

- Plan 01-13 mounts the demo switcher inside `SiteHeader` at `#header-demo-slot`.
- Plan 01-10 must run the live-DB smoke test: the four skeleton case titles are unchanged.
- `npm ci` was needed first in the worktree (no node_modules).

## Self-Check: PASSED

All 11 created files and 2 modified files exist; commits 43e7fdd and a061782 are in `git log`.
