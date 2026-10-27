---
phase: 1
slug: foundation-deploy-spikes
status: approved
scope: minimal
created: 2026-10-27
source: owner decision D-05 (01-CONTEXT.md), confirmed 2026-10-27 when the UI safety gate tripped after wave 1
---

# Phase 1 — UI Design Contract (minimal)

> Phase 1 screens are infrastructure screens: auth, a role dashboard, the demo role switcher and spike diagnostic pages. The owner chose not to design them (D-05). This contract records that decision so later waves have a fixed, checkable target. Full UI specs start in Phase 2 via `/gsd-ui-phase`.

## Visual system

| Property | Contract |
|----------|----------|
| Component library | shadcn 4.22.1 defaults (plan 01-04), unmodified theme |
| Styling | Tailwind 4 utility classes; no custom CSS beyond what the scaffold and shadcn emit |
| Colors / typography / radius | shadcn default tokens; no brand palette, no custom fonts in Phase 1 |
| Icons | `lucide-react` only, where an icon is needed at all |
| Dark mode | Whatever shadcn defaults provide; not a Phase 1 requirement |

## Screens in scope

| Screen | Route (per plans) | Must show |
|--------|-------------------|-----------|
| Landing | `/` | Product name, links to sign up and log in |
| Sign up | sign-up page (plan 01-09) | Email, password, role choice (customer / worker / judge when allowed by D-02), PayPal email field shown and required only for workers; field-level error messages |
| Log in | log-in page (plan 01-09) | Email, password, error message on failure |
| Dashboard | role dashboard (plan 01-09) | Signed-in user's email and role, read from Postgres; worker heartbeat status card |
| Header | all signed-in pages | Current account and role; sign-out; demo role switcher only when `DEMO_MODE=true` (plan 01-13) |
| Spike diagnostic pages | `/spikes/*` (plans 01-16, 01-17) | Functional only: controls and a results table; no styling requirements |

## Layout and interaction rules

- Mobile-usable at 375 px width with no horizontal scroll (phones are used in the S-CAM and S-SSE spikes).
- Single-column forms; full-width primary button; labels above inputs.
- Every form shows server errors inline; buttons show a disabled/pending state while submitting.
- Standard semantic HTML: real `<label>` for every input, `<button>` for actions, visible focus rings (shadcn default).

## Out of scope for Phase 1

- Brand identity, illustrations, marketing copy, animations beyond shadcn defaults.
- Customer and worker job flows (Phase 3+), review panel (Phase 5), judge console (Phase 6) — each gets a full UI-SPEC in its phase.

## Acceptance

A Phase 1 screen conforms if it uses shadcn default components and tokens, meets the layout rules above, and shows the "Must show" items for its row. No pixel-level review is required.
