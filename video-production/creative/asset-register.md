# Asset register and known limits (checkpoint C draft)

## What is real
All product footage is a recording or screenshot of the live site (sunrootlearn.com) on a demo account, captured on 23 Nov 2026. Nothing inside a phone frame was redrawn or generated.

| File | What it shows | Used in |
|---|---|---|
| capture/add.mp4 | Home, then the "Add to Sunroot" menu | scene 3 |
| capture/still-notes-result.png | Notes made from a sample physics PDF (the PDF was written for this film: Newton's laws, PHY 101) | scene 4 |
| capture/tutor.mp4 | AI Tutor, a question typed and sent | scene 5 |
| capture/readalong.mp4 | Read-along page with Sprout | scene 5 |
| capture/quiz-right.mp4, quiz-wrong.mp4 | A quiz question answered right, and wrong ("Not quite", with the reason) | scenes 6, 7 |
| capture/still-written.png | Written practice setup | scene 6 |
| capture/still-flash.png | Flashcards (a card, question side) | scene 8 |
| capture/still-labs.png, still-studio.png, still-focus.png | Virtual lab, Maker Studio, Focus rooms | scene 9 |

Vector scenes (desk and paper, the maze, the learning path, the saved-mistake card, the calendar, the end card) are drawn in code. Sprout in those scenes is a still vector copy of the app's character (calm palette).

## Voice, music, fonts
- Voiceover: a generated Nigerian English neural voice (en-NG-EzinneNeural), a placeholder for a human recording. Replace the files in public/vo (s01..s11 for the 60 s film; c30_* and c15_* for the cutdowns) and update the durations in src/film/config.ts.
- Music: an original ambient bed synthesised for this draft (public/vo/music.mp3). No third-party music.
- Fonts: Instrument Sans, Instrument Serif, IBM Plex Mono (SIL Open Font License), in public/fonts.

## Things to verify before publishing (brief, part 13)
- The notes, quiz question and tutor answer shown are genuine output from the live app (they are), but the founder should approve them for public use.
- The "(removed: the app is not free)" line and the "Start learning" call to action.
- The end-card credit (founder name and Top 10 finalist line) is included as a draft; remove it in src/film/scenes.tsx (scene 11) if not approved.
- The scene 5 read-along clip is muted: the live product speaks; the film's voiceover covers it.
- No private data appears: the demo account is "Demo", with no real names or emails. The "Teacher plan" line and "Free" badge visible in a few frames belong to the demo account.

## Known limitations
- Footage was recorded at 390x844 and upscaled 2x, so phone content is slightly soft at full size; re-record at a higher device scale for the final.
- Scene 2 and 10 desk and paper are vector, not cinematic live footage; Google Flow / Veo inserts were not generated.
- The founder's earlier discussion of ADHD and slower-learner origin is deliberately not used in the film.
- Home for a brand-new demo account says "Start by joining a class", so Home is not shown as a hero in this film.
