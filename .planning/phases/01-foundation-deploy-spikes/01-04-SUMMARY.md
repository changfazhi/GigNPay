---
phase: 01-foundation-deploy-spikes
plan: 04
subsystem: ui
tags: [shadcn, tailwind, base-ui, exact-pins]
requires: [01-02]
provides:
  - shadcn 4.22.1 defaults (base-nova style, neutral base) on Tailwind 4
  - button, input, label, card, radio-group components in src/components/ui
  - cn() helper at src/lib/utils.ts
affects: [01-09]
tech-stack:
  added: [shadcn, "@base-ui/react", class-variance-authority, cn, lucide-react, tw-animate-css]
  patterns: [shadcn CLI init then add, exact pins via .npmrc save-exact]
key-files:
  created: [components.json, src/lib/utils.ts, src/components/ui/button.tsx, src/components/ui/input.tsx, src/components/ui/label.tsx, src/components/ui/card.tsx, src/components/ui/radio-group.tsx]
  modified: [package.json, package-lock.json, src/app/globals.css]
key-decisions:
  - "Followed the 'approved, keep cn' branch of the owner's legitimacy answer"
requirements-completed: [AUTH-01]
duration: ~10min
completed: 2026-10-27
status: complete
---

# Phase 1 Plan 04: shadcn defaults and UI components Summary

Plain shadcn 4.22.1 defaults with button, input, label, card and radio-group installed on Tailwind 4, using the default `cn` package as the owner approved.

## Owner's answer branch followed

`01-02-SUMMARY.md` records the owner's answer "approved" (keep `cn`). I followed that branch: ran `npx shadcn@4.22.1 init -d -y` and `npx shadcn@4.22.1 add -y button input label card radio-group` with no clsx + tailwind-merge replacement. `src/lib/utils.ts` is `export { cn } from "cn"`, and `cn` 0.5.0 is in `dependencies`. No other package outside that approved set was installed.

## Packages shadcn added (exact versions)

shadcn 4.22.1, @base-ui/react 1.9.0, class-variance-authority 0.7.1, cn 0.5.0, lucide-react 1.61.0, tw-animate-css 1.4.0. All landed as exact pins because `.npmrc` has `save-exact=true`, so no re-pin was needed. The pin check reports "all exact".

shadcn style is `base-nova` (Base UI primitives), baseColor `neutral`, icon library lucide, aliases `@/components`, `@/lib/utils`, `@/components/ui`. `globals.css` received the shadcn theme tokens (defaults, unmodified).

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | shadcn defaults and the five Phase 1 components (D-05) | 863fea9 |

## Verification

`npm ci` was run first (no node_modules in the worktree). `npm run typecheck`, `npm run lint` and `npm run build:check` all exit 0. All five component files and `components.json` exist; no `^` or `~` ranges in package.json.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Notes

The `shadcn` package itself is in `dependencies` (the CLI puts it there because `globals.css` imports `shadcn/tailwind.css`). The scaffold `page.tsx` and layout are untouched; plan 01-09 builds the screens.

## Self-Check: PASSED

Commit 863fea9 exists; components.json, src/lib/utils.ts and the five ui component files are present.
