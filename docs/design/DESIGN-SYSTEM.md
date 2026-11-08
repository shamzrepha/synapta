# Sunroot design system

Two parts: how it looks (colour, type, shape) and how it works (layout and navigation).

## Colour: the reasoning
1. **Blue leads.** Blue supports calm, sustained attention and signals trust, which is why it leads in learning and productivity tools. It is Sunroot's action and knowledge colour: buttons, links, selection, focus, mastery. (`brand-*` classes)
2. **Warm colour is for reward only.** Gold marks streaks, XP and badges, so it reads as "you earned something". It is never a button. (`amber-*`)
3. **Green is for confirmation.** A blue-leaning teal-green marks "correct" and "saved". (`teal-*`)
4. **Coral or red means needs attention**, always with an icon or words. (`rose-*`, `orange-*`)
5. **Neutrals are tinted toward the brand hue** (ink-navy in dark, cool paper in light) so everything feels related. (`slate-*`)
6. **Data is encoded by lightness, not only hue.** The mastery heatmap uses one blue scale (light = still learning, dark = mastered), a hatched warm cell for "needs work", and a number in every cell. Blue against orange stays distinguishable for people with red-green colour blindness, about 8% of men, and it survives greyscale.
7. **60 / 30 / 10.** About 60% neutrals, 30% brand blue, 10% gold and status colours.

| Role | Light | Dark |
|---|---|---|
| Page / card / hairline | `#F6F7FB` / `#FFFFFF` / `#DFE3EE` | `#0B0E1A` / `#121629` / `#1F2538` |
| Text / muted | `#141829` / `#5A6482` | `#E7EAF5` / `#98A1BB` |
| Brand blue (button, link) | `#3552E0` (white text, 7:1) | `#4A6CF7` (white text, 4.6:1) |
| Reward gold | `#C27F0E` text, `#F5B83A` fill | `#F5B83A` |
| Mastery scale | `#C5D3FF` competent, `#2A41B8` mastered, hatched orange needs work | `#6F8DFF` family |

**Implementation note:** the semantic classes (`bg-card`, `border-border`, `text-muted-foreground`, `bg-background`, `bg-popover`, `text-foreground`) must be declared in the `@theme inline` block in `app/globals.css`. Without it Tailwind v4 generates nothing for them (cards lose their background, plain borders turn full-contrast black or white). A base rule makes every bare `border` a hairline.

## Type, shape, motion
Instrument Sans for everything; Instrument Serif italic for one emphasised word in a headline (landing page); IBM Plex Mono, uppercase and widely tracked, for labels and numbers. Small, crisp radii (controls 6px, cards 8px). Shadows only for floating layers. One easing curve, `cubic-bezier(0.16, 1, 0.3, 1)`. All motion respects `prefers-reduced-motion`.

## Layout and navigation: how it works
1. **Everything starts from something you add.** "Add material" is one tap from every screen: the centre `+` on phones, the top button in the sidebar. It opens a short list (upload notes or a scan, snap homework, chat with a document, ask the tutor; teachers also get "create a class").
2. **Phone bar:** Home, Classes, `+`, Study, Community. Saved, Profile, Everything, Plans and Admin live in the account menu.
3. **Home is "Today".** In order: where you are (greeting, streak), what to do next, add material, today's goals, your classes as a scannable list, mastery, what is happening around you. One primary action per screen.
4. **Hubs group by intent, not by feature team.** The Study hub lists Capture, Learn, Practice, Plan, Build, Rewards as compact rows (`lib/features/intents.ts`), with only a few large "start with these" cards.
5. **Wide tables become cards on phones.** The class heatmap shows one card per student with a wrapping grid of topic tiles (`components/classes/mobile-heatmap.tsx`). No pinned column, no sideways scrolling.

## Not done yet
- Other screens still carry older spacing habits (nested cards, heavy padding). Apply the same treatment screen by screen: one primary action, short lists, tables become cards on phones.
- A global command palette (Ctrl/Cmd+K) to jump anywhere.
