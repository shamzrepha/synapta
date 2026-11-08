---
name: anti-slop-playbook
description: Design rules for Sunroot's frontend. Use whenever you write or change UI (components, pages, global CSS, Tailwind tokens) so the app looks bespoke, not like generic AI boilerplate.
---

# Anti-slop playbook for Sunroot

Design language: see `docs/design/DESIGN-SYSTEM.md`. Use the scale classes, never raw hex.
- `brand-*` = blue: the action and knowledge colour. `amber-*` = reward gold (streaks, XP; never a button). `teal-*` = success/confirmation. `rose-*` and `orange-*` = needs attention (always with an icon or words). `slate-*` = ink-navy and cool paper neutrals.
- Data is encoded by lightness and pattern, not hue alone (mastery heatmap: blue scale + hatched warm cell + a number).
- Use the semantic classes (`bg-card`, `border-border`, `text-muted-foreground`, `bg-background`); they are declared in `@theme inline` in `app/globals.css`.
- One primary action per screen; short grouped lists instead of walls of equal cards; wide tables become cards on phones.
- Type: Instrument Sans; IBM Plex Mono labels. Hairline borders, small crisp radii, shadows only for floating layers.
- Motion with purpose; everything off under `prefers-reduced-motion`.
- Light and dark are both first-class; the choice is applied before first paint.
- Feature icons are line icons (`components/shell/feature-icon.tsx`), never emoji.

## Never
- Default Inter / Arial / system stacks as the visible font.
- Pure grey (`#888`, `#444`, `text-gray-*`) on brand or dark surfaces. Use the tinted `slate` scale.
- Card inside card inside card; a border around every paragraph or metric.
- Thick opaque borders and the same radius on everything.
- Bounce, elastic or spring easing; abrupt linear changes. (Typing dots use `.typing-dot`.)
- Cramped containers: text touching edges, no vertical rhythm.

## Always
- Headings with tight tracking (already global); body copy `leading-relaxed`.
- Spacing on the 4px/8px grid; sections breathe (`py-16` to `py-28` on marketing pages, `gap-6` to `gap-10`).
- Group with whitespace, type hierarchy and subtle surface shifts before reaching for a border.
- Hairline borders (`border-slate-200/70`, `dark:border-white/10`), layered ambient shadows (`shadow-soft`, `shadow-elevated`), tinted surfaces.
- One easing: `--ease-out-expo` (`cubic-bezier(0.16, 1, 0.3, 1)`), already the default for every Tailwind `transition-*`. Prefer `transition-colors`, `transition-shadow`, `transition-transform` over `transition-all` on large layouts.
- Respect `prefers-reduced-motion` (global rule in `globals.css`); never put essential information only in motion.
- Touch targets at least 44px on phones; check 360px, 390px, 768px and 1280px widths for overlap and overflow.

## Keep
Business logic, hooks, types, API calls and routing are not part of a visual change. After any UI change run: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run check:guards`, `npm run check:models`.
