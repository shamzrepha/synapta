# Sunroot video production (Remotion)

Isolated from the app: its own `package.json`, excluded from the app's tsc, eslint, vitest and Docker build.

Setup: `cd video-production && npm install`
Preview in the browser: `npm run studio`
Low-res proof renders: `npm run render:proof` and `npm run render:proof:vertical` (writes to `out/`, which is not committed).
In a sandbox with no internet, add `--browser-executable=<path to chrome-headless-shell> --chrome-mode=headless-shell`.

All colours, fonts, easing and timing are in `src/theme.ts`. Fonts (Instrument Sans, Instrument Serif, IBM Plex Mono, all SIL Open Font License) are shipped in `public/fonts`, so renders never need a network.

Status: checkpoint B (8 s proof of style, 16:9 and 9:16). No product screen recordings, voiceover or music are included yet.
