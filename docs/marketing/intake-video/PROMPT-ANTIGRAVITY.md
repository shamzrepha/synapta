# Prompt for Antigravity (copy everything below the line)

---

You are making a 43-second vertical (1080x1920, 30 fps) welcome video for SunrootLearn, for **students who have just been admitted to university**. Goal: make them smile, then show why they should use the app. The narrator is **Sprout**, the app's robot study buddy, with a robot voice. Audience speaks English; do not mention languages.

## Read first (all in this repo)
- `docs/marketing/intake-video/SCRIPT.md`: the scene-by-scene script and timing. This is the source of truth.
- `docs/marketing/intake-video/lines.json`: the 9 spoken lines.
- `docs/marketing/intake-video/assets/`: real app screenshots (`phone-*.png`), `popup-sheet.png`, logos.
- `docs/marketing/ad-kit/sprout/*.png`: Sprout in 14 poses (use as references if you need images).
- `docs/design/DESIGN-SYSTEM.md` and `.claude/skills/anti-slop-playbook/SKILL.md`: blue brand; gold only for rewards.
- `public/pitch/`: the older pitch film. Reuse its ideas (kinetic type, sunrise rings, glowing logo end card, procedural music). Do not reuse its language-learning story.

## What already exists (do not rebuild)
`docs/marketing/intake-video/` already has a working pipeline:
1. `voice.py <work> <piper-model.onnx>`: Sprout's voice lines (Piper TTS plus a robot effects chain).
2. `build_audio.py <work>`: music, sound effects, mouth-sync envelopes and `timeline.json`.
3. `film.html` + `sprout.js`: the film, rendered frame by frame through `window.renderAsync(t)`. Sprout is drawn in SVG.
4. `render.mjs <work> 30`: Playwright screenshots to `frames/`; then `ffmpeg -framerate 30 -i frames/f%05d.jpg -i audio.wav -af loudnorm=I=-16:TP=-1.5 -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac out.mp4`.
See `README.md` there for exact commands. Run the pipeline, review frames, and improve anything that looks weak.

## Your job
1. Run the pipeline and watch the result (contact sheet every 2 s).
2. Improve polish: smoother motion, better easing, richer motion graphics (kinetic text, shape transitions, particle bursts), cleaner Sprout acting. Keep it flat, bright and blue. Keep the real screenshots: they are the proof.
3. Keep the robot voice recognisable and clear. If you change the voice, audition three variants and keep the clearest.
4. Hard rules: every on-screen word must match the script; captions inside the safe area (nothing in the bottom 12% beyond the caption pill or the top 8%); no flashing faster than 3 times a second; no real faces; no claims about grades or numbers of students; no dev badge or email in any frame; loudness about -16 LUFS, true peak below -1 dBFS.
5. Export `sunroot_welcome.mp4` (1080x1920, H.264/AAC) plus a 1080x1080 centre crop variant and a 16:9 variant (place the phone and Sprout side by side). Do not commit rendered frames or videos to git; upload the MP4s to a GitHub Release or hand them back.
6. Commit only source changes under `docs/marketing/intake-video/`. Run `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` before any push (CLAUDE.md).
7. Report: what changed, the final file paths, and anything you could not verify.
