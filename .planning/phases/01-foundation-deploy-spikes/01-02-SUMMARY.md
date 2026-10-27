---
phase: 01-foundation-deploy-spikes
plan: 02
subsystem: infra
tags: [nextjs, typescript, tailwind, npm, exact-pins, env]
requires: []
provides:
  - Buildable Next.js 16.4.3 App Router app (TypeScript 5.9.3, Tailwind 4.3.3)
  - Every Phase 1 runtime and dev dependency installed once with exact pins and committed lockfile
  - Full Phase 1 npm script set (build:check, worker, db:*, seed, render:predeploy, typecheck, lint, test, test:smoke, test:all)
  - .gitignore for .env* (except .env.example) and .spike-state/; .env.example with empty values
  - Owner's package legitimacy answer for plan 01-04 (shadcn)
affects: [01-03, 01-04, 01-05, 01-09, 01-13, 01-17]
tech-stack:
  added: [next, react, drizzle-orm, drizzle-kit, pg, better-auth, zod, pg-boss, tsx, aws-sdk-s3, exifr, sharp, sharp-phash, vitest, elastic, anthropic-sdk, google-genai]
  patterns: [save-exact via .npmrc, scaffold-in-temp-dir then copy in, AGENTS.md marker-delimited append]
key-files:
  created: [package.json, package-lock.json, .npmrc, .node-version, .gitignore, .env.example, next.config.ts, tsconfig.json, eslint.config.mjs, src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, README.md, public/*]
  modified: [AGENTS.md]
key-decisions:
  - "Keep shadcn default `cn` helper (owner approved)"
  - "@types/node raised from scaffold ^20 to exact 24.19.2 to satisfy vitest 5.0.5 peer range"
  - "RootLayout typed with explicit children prop instead of the generated global LayoutProps, so tsc works on a fresh clone"
requirements-completed: [FND-01]
duration: ~20min
completed: 2026-10-27
status: complete
---

# Phase 1 Plan 02: Scaffold Next 16 with exact pins Summary

Next.js 16.4.3 App Router scaffold (no cache-components flags) with every Phase 1 package pinned exactly, the full script set that later plans call, and secret files git can never pick up.

## Package legitimacy answer

Owner's answer to the Task 1 checkpoint (verbatim): "approved"

Meaning: keep `cn` (shadcn 4.22.1 default); all core packages approved as listed in the checkpoint. Plan 01-04 should run `npx shadcn@4.22.1 init -d -y` with the default `cn`; no clsx + tailwind-merge fallback is needed. Never install: typescript 7, prisma, next-auth, ffmpeg-static, legacy PayPal SDKs, @paypal/paypal-server-sdk (Phase 2).

## Exact installed versions

dependencies: next 16.4.3, react 19.3.1, react-dom 19.3.1, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, better-auth 1.7.14, zod 4.6.7, pg-boss 12.38.0, tsx 4.23.15, @aws-sdk/client-s3 3.1157.0, @aws-sdk/s3-request-presigner 3.1157.0, exifr 7.1.3, sharp 0.35.5, sharp-phash 2.2.0.

devDependencies: typescript 5.9.3, @types/pg 8.23.1, vitest 5.0.5, @elastic/elasticsearch 9.5.1, @anthropic-ai/sdk 1.3.0, @google/genai 2.31.0, @tailwindcss/turbopack 4.3.3, tailwindcss 4.3.3, eslint 9.39.5, eslint-config-next 16.4.3, @types/node 24.19.2, @types/react 19.3.0, @types/react-dom 19.3.0.

No `^` or `~` ranges remain. `.npmrc` is `save-exact=true`, `.node-version` is `24`, `engines.node` is `>=22.12 <25`.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Package legitimacy gate (owner answered "approved"; nothing committed) | n/a |
| 2 | Scaffold Next 16, pin dependencies, scripts, .gitignore, .env.example | 05eb53b |

## Verification

`npm run typecheck`, `npm run lint` and `npm run build:check` exit 0 (checked from a clean `.next`). The plan's pin/script node check passes; `next.config.ts` has 0 matches for the cache-components flags and lists `serverExternalPackages`; `AGENTS.md` has `next-scaffold:start` once and `GSD:project-start` once; `git ls-files .env.local` is empty.

## AGENTS.md

The tracked GSD `AGENTS.md` was preserved intact and the Next scaffold guidance was appended between `next-scaffold:start` and `next-scaffold:end` markers. MAIN_ROOT has no untracked AGENTS.md (it is tracked at the base commit), so no pre-merge removal is needed.

## Deviations from Plan

**1. [Rule 3 - Blocking] @types/node bumped from scaffold `^20` to exact 24.19.2**
- **Found during:** Task 2 dev dependency install
- **Issue:** vitest@5.0.5 declares an optional peer `@types/node ^22 || >=24`; the scaffold's `@types/node@^20` caused ERESOLVE.
- **Fix:** Installed `@types/node@24.19.2` (matches the Node 24 target, within `engines`). Not a new package, same family the scaffold emits.
- **Files modified:** package.json, package-lock.json
- **Commit:** 05eb53b

**2. [Rule 1 - Bug] RootLayout used global `LayoutProps<"/">`**
- **Found during:** Task 2 typecheck
- **Issue:** `LayoutProps` is generated into `.next/types` only after a build, so `npm run typecheck` failed on a fresh clone (TS2304).
- **Fix:** Typed the prop as `{ children: React.ReactNode }`.
- **Files modified:** src/app/layout.tsx
- **Commit:** 05eb53b

**3. No postcss.config.mjs.** The 16.4.3 scaffold uses the `@tailwindcss/turbopack` loader in `next.config.ts` and emits no PostCSS config, so none exists (listed in the plan's files_modified but not produced by the scaffold).

The plan 01-01 spike file `scripts/spikes/paypal/aged-orders.ts` was not present in this checkout, so no typing fix was needed.

## Known Stubs

None. `src/app/page.tsx` and metadata are the unmodified scaffold defaults; plans 01-04 and 01-09 replace them.

## Notes

`npm audit` reports 4 moderate advisories in transitive dependencies; not addressed (out of scope, exact pins are owner-approved).

## Self-Check: PASSED

Commit 05eb53b exists; package.json, package-lock.json, .npmrc, .node-version, .gitignore, .env.example, next.config.ts, AGENTS.md all present.
