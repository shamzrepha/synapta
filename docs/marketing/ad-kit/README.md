# SunrootLearn ad kit: Sprout introduces the app

For the wave of new students arriving. English-speaking audience. Sprout is the host of every ad.

## Which Google product? Use two, each for what it is good at

| Job | Use | Why |
|---|---|---|
| Sprout acting (hopping in, magnifier, rope, backflip, napping) | **Google Flow** (Veo) | Flow's **Ingredients to Video** takes reference images so a character stays the same across clips, and **Frames to Video** animates between a first and last image. Sprout's 14 reference images are in `sprout/`. |
| Putting it together (real app clips, captions, voiceover, music, end card) | **Google Vids** | It is a video editor: drop in clips and screenshots, add a voiceover and captions, finish. It also has its own image-to-video if you need one extra shot. |
| Showing the app | **The real screen recordings in `clips/`** | AI video cannot be trusted to draw real app screens: text and buttons come out wrong. Real recordings are the proof, and they already look great. |

Rule of thumb: **Flow for Sprout, real clips for the app, Vids to glue it, one human or Vids voiceover over everything.**

What the web says today (check before you pay for anything, third-party sources disagree on plans and prices):
- Flow makes short clips (about 8 seconds each) with Google's Veo models and has Text to Video, Frames to Video, Ingredients to Video and a scene builder. Whether **Ingredients** is on your plan varies by source, so open Flow's plan page first. There is a free tier with daily credits.
- Google Vids can turn images into short clips with Veo, make AI voiceovers and has avatars. You do not need an avatar: Sprout is the host. Free accounts get a small monthly allowance.
- Check in Vids whether it can make **9:16 (vertical)** videos. If not, export 16:9 for YouTube and cut the vertical versions in the YouTube Shorts editor or any phone editor.

Sources: [Flow review](https://saascrmreview.com/google-flow-review/), [Flow overview](https://imagine.art/blogs/google-flow-overview), [Google Vids guide](https://workspace.google.com/blog/product-announcements/create-and-edit-videos-with-gen-ai-in-google-vids), [Vids image-to-video](https://petapixel.com/2025/08/27/google-vids-uses-ai-to-turn-photos-into-videos/).

## What is in this folder
```
sprout/     14 transparent PNGs of Sprout (900x1008): the references to upload to Flow as Ingredients / first and last frames
screens/    phone (1170x2532) and desktop (2880x1800) screenshots: lesson page, table page, word pop-up with Sprout perched,
            Sprout's menu, focus sprint, and the real landing page
clips/      3 real screen recordings, 540x960 (9:16), no sound, with a soft circle where a finger taps:
              clip-1  tap a word -> Sprout runs over with a magnifier -> fires a rope -> hauls the answer card up   (about 18 s)
              clip-2  tap Sprout -> its menu -> start a 10-minute focus sprint                                    (about 12 s)
              clip-3  Sprout shows off: introduces itself, dances, backflips                                      (about 12 s)
SCRIPTS.md          three 15-second hooks, a 40-second main ad and a 6-second bumper, with a shot table for each
FLOW-PROMPTS.md     Sprout's character description and a prompt for each Sprout scene
CHECKLIST.md        what to verify before you spend money on ads
CONTACT-SHEET-*.png everything at a glance
```

## Important: these screenshots use sample content
I could not sign in to your live app from here, so the lesson content is a sample Biology page ("How your heart pumps blood") shown through the real app components. The look, the table, the pop-up and Sprout's animation are exactly the real thing. The landing-page screenshots are the real live page. **Still to capture from your own phone** (use a test account, hide your email): the Home / Today screen, a class map, a quiz or flashcards screen, and Sprout's wardrobe in the shop. Exact framing is in `CHECKLIST.md`.

## Workflow (about 2 hours for the first ad)
1. Flow: make a project, upload the Sprout images from `sprout/` as Ingredients, generate the 4 to 6 Sprout scenes from `FLOW-PROMPTS.md` (3 or 4 tries each, keep the best).
2. Record or choose the voiceover: read the lines in `SCRIPTS.md` yourself, or use Vids' AI voice. One voice for the whole ad, and mute the sound Flow generates.
3. Vids: new video, drop in Flow clips and `clips/` recordings in the order of the shot table, lay the voiceover underneath, add captions and the end card.
4. Export. Make the 3 hooks first, run each for a day, keep the one that gets the most sign-ups.
