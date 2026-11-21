# Animated favicon (Sprout)

The tab icon is Sprout, drawn on a 64x64 offscreen canvas (`lib/favicon/draw.ts`, same geometry as `components/bot/sprout.tsx`) and written to `<link id="sunroot-favicon" rel="icon">` by `components/shell/animated-favicon.tsx`. Frame logic is pure and tested: `lib/favicon/frames.ts`.

## Mood (from `/api/pet`, resting frame)

| Mood | Body | Ring | Badge | Eyes |
|---|---|---|---|---|
| calm | blue | none | none | open, blink every 6-10 s |
| happy | teal | teal | none | open, blink |
| fired | orange | gold | flame | open, blink |
| genius | violet | violet | star | open, blink |
| sleepy | grey-blue | none | z | closed, no blink |

## Events (`window.dispatchEvent(new CustomEvent("sunroot:favicon", { detail: { kind } }))`)

| kind | Frames (8 at 6 fps, then stop) | Sent from |
|---|---|---|
| correct | hop, happy eyes, gold ring, spark | `fireCelebration` (small/medium) |
| levelup | bigger hop, gold ring, star/spark | `fireCelebration` (grand) |
| streak | hop, orange ring, flame | helper `faviconEvent("streak")`; not yet dispatched (streak code owned elsewhere) |
| sleepy | eyes close, grey ring, z | automatic after 5 min without events |

## Budget

- Idle: static frame, one blink (160 ms) every 6-10 s.
- Bursts: 8 frames at 6 fps, then back to the static frame.
- At most one canvas draw per 150 ms (`tooSoon`).
- No animation under `prefers-reduced-motion` (static mood frame only); everything pauses after the tab is hidden for 2 minutes and resumes on return.
- All timers and listeners are removed on unmount.
- Safari (and any browser that ignores icon updates) keeps showing the last static frame; the static files `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png` and `public/icons/*` are the fallback.

## Static icons

Edit `app/icon.svg`, then run `node scripts/gen-icons.mjs` (uses `sharp`) to regenerate `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `app/apple-icon.png` and `app/favicon.ico`.

## Android app icon (separate `sunroot-mobile` project)

Use `public/icons/icon-512.png` as the source for the launcher icon. Adaptive icon: foreground = Sprout on transparent (export `app/icon.svg` without the background rect, keep within the central 66% safe zone), background = `#eaf0ff`. Regenerate mipmaps (mdpi 48 to xxxhdpi 192) and the monochrome themed-icon layer from the same SVG. Update per `docs/antigravity/APP-AUTO-UPDATE.md` when shipping.
