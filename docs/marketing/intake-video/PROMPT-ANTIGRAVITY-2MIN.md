# Prompt for Antigravity: the 2-minute film (copy everything below the line)

Do not render anything yet if the plan needs my approval: first reply with your storyboard (one line per scene) and what you will reuse, then build.

---

You are making the **2-minute (about 120 s) vertical film (1080x1920, 30 fps)** for SunrootLearn, for **students who have just been admitted to university**. It has three acts: **the problem, the solution, why ours is better**. It is the longer sibling of the 43-second welcome film already in this repo, and it borrows the structure of the investor pitch film.

## The idea (the whole film in one line)
**Cramming gets you through the night; understanding is what stays.** New students will be tempted to memorise everything the night before and forget it by the next week. SunrootLearn helps them *understand*, so it sticks. The narrator is **Sprout**, the app's robot study buddy, speaking in a robot voice. The audience speaks English: no language angle (we dropped the pitch film's multilingual story).

## Read first (all in this repo)
- `docs/marketing/intake-video/` (README, SCRIPT.md, lines.json, voice.py, build_audio.py, film.html, sprout.js, render.mjs, assets/): the working pipeline for the 43 s film. Extend it (new `film2.html`, new lines file); do not start from zero.
- `public/pitch/video.html` and `public/pitch/index.html`: the pitch film. **Reuse**: the problem-solution-proof structure, the late-night "eleven p.m., exam tomorrow" opening beat, the "who was lost, found out too late" idea (retold for students), kinetic type, sunrise rings, the glowing logo end card, procedural music and the "Understand it. Build it. Prove it." closing line. **Drop**: languages, teachers' cognitive X-ray, pilot talk.
- `docs/marketing/ad-kit/` (sprout poses, real clips, screenshots, CHECKLIST.md: the claims rules).
- `docs/design/DESIGN-SYSTEM.md`, `.claude/skills/anti-slop-playbook/SKILL.md`: blue brand, gold only for rewards.

## Script (about 280 spoken words; adjust timing to the voice, keep the meaning)
Timings are a guide. Every line is spoken by Sprout.

**Act 0: Welcome (0-12 s)**
1. "Beep boop! Congratulations! You got admitted!"
2. "Welcome to the next chapter. I'm Sprout, and I want you to still know this stuff in four years."

**Act 1: The problem (12-45 s)** (dark blue, a little tense, funny)
3. "Here's how first year usually goes. Lectures fly by. Notes pile up. Then it's eleven p.m., the test is tomorrow, and you have forty pages to read."
4. "So you cram. You read it again and again until the words look familiar."
5. "Familiar is not the same as understood. The test comes, and you remember it. For a day."
6. "A week later it's gone. And then next semester builds on it. Nobody tells you that part."
(Visuals: a night desk, a growing pile of pages, a countdown clock, then a page whose words fade out one by one like a memory slipping; a second semester block that wobbles because its foundation is missing.)

**Act 2: The solution (45-85 s)** (the screen brightens, Sprout takes over)
7. "Here's what I do instead. Drop in your notes, your slides, even a photo of the board. I turn them into lessons you can actually follow."
8. "Stuck on a word? Tap it. I run over and pull the answer up in plain words, with an example."
9. "Then I make you use it. Flashcards, quizzes, small challenges. Not copying. Explaining, choosing, building."
10. "And I keep watch. A ten minute focus sprint when you can't settle. XP and a streak so you come back tomorrow, not just tonight."
(Visuals: real screenshots and recordings: lesson page, tap-a-word with the rope-pull pop-up, quiz/flashcard screen, focus sprint, XP/streak. Use `assets/` and `docs/marketing/ad-kit/clips/`. Do not invent screens.)

**Act 3: Why ours is better (85-115 s)**
11. "Other tools give you the answer. I make you get it."  *(comparison panel: "Memorise it tonight" vs "Understand it for good": reading the page again vs explaining it; one long cram session vs small sessions that add up; forgetting by Friday vs building on it next semester. Keep it to three rows, plain words, no competitor names.)*
12. "I notice what you find hard, so you spend your time there."  *(only show if the evaluation / "How am I doing?" screen exists in the app today: check the app and use the real screen)*
13. "Learn it once, properly, and the exams get easier too."

**Close (115-125 s)**
14. "Congratulations again. Understand it. Build it. Prove it. SunrootLearn. Start free today. Let's go!"

## Claims rules (important)
- Only what the app does today. Open the app/code and confirm each feature before showing or saying it; if a line is not true today, rewrite it so it is. In particular check spaced review, the "notice what you find hard" feature, and quiz/challenge behaviour.
- The forgetting idea is general learning science: say it in plain words with **no statistics, percentages or study citations**.
- No promises about grades, no medical claims, no student counts, no competitor names or logos, no real faces.

## Production
1. Reply with the storyboard first. Then build: reuse `voice.py` (robot voice), `build_audio.py` pattern for music, SFX, mouth sync and timeline, `sprout.js` for Sprout, and the render pipeline (`render.mjs` + ffmpeg).
2. Motion graphics: kinetic type, shape transitions, a forgetting animation (words dissolving), a stacking-foundation animation, a comparison panel, a strong colour shift from dark and tense (problem) to bright blue (solution). Sprout acts: tired and worried in Act 1 (sleepy mood, eyes drooping), energetic in Act 2 (magnifier, rope launcher, backflip), proud in Act 3 (graduation cap, crown only as a reward moment).
3. Robot voice must stay clear. Audition three variants of the voice on one line and keep the clearest. Loudness about -16 LUFS, true peak under -1 dBFS; duck music under the voice.
4. Captions for every spoken word, about 52 px, inside the safe area (top 8% and bottom 12% free of anything except the caption pill). No flashing faster than 3 times a second. No dev badge, email or test-account detail in any frame.
5. Output: `sunroot_intake_2min.mp4` (9:16), plus 1:1 and 16:9 cuts, plus a 30 s cut-down (Acts 1 + 2 highlights) for ads. Do not commit frames or videos to git; hand them back or put them in a GitHub Release.
6. Commit sources only under `docs/marketing/intake-video/`. Before any push run `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run check:guards`, `npm run check:models` (CLAUDE.md).
7. Report: the final file paths, which app features you verified for each claim, and anything you could not check.
