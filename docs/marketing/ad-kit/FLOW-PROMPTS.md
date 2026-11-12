# Google Flow: Sprout prompts

## Before you start
1. Open Flow, make a project, set the format to **vertical 9:16** if offered (otherwise generate 16:9 and crop).
2. Upload the images from `sprout/` as **Ingredients** (so Flow keeps Sprout looking the same). Use `02-sprout-neutral.png` as the main one, plus the pose you want in each scene.
3. For an exact start and end, use **Frames to Video**: first frame = one Sprout image, last frame = another (for example `02-sprout-neutral` then `05-sprout-cheer`). Flow animates between them.
4. Each clip is about 8 seconds. One action per clip. Generate 3 or 4 versions and keep the best. Credits and which model you can use depend on your plan: check the plan page.
5. **Never ask Flow to write text on screen.** AI video draws letters badly. Add all words in Google Vids.
6. Flow can make sound. Ignore it: use one voiceover over the whole ad so Sprout's voice never changes from clip to clip.

## Sprout, described once (paste this at the start of every prompt)
> Sprout: a small, round, friendly robot-pet. Smooth blue body shaped like an egg, a white rounded face screen with two big glossy black eyes with a white highlight, pink blush circles on the cheeks, a small smile, tiny stubby arms, round feet, and one green sprout with two teal leaves growing from the top of its head. Clean, bright, flat-shaded 3D cartoon style like a premium mobile-game mascot. Soft studio lighting, saturated colours, no outlines. Sprout is about the size of a coffee mug.

Sprout changes colour with how the learner is doing (a real app feature, and a nice ad detail): blue by default, teal when happy, orange on a streak, purple when it feels like a genius, grey when sleepy. The reference images show these. For an ad, pick one (blue or teal) per scene and say it in the prompt, for example "Sprout has a bright blue body". Keep to that wording so it matches the reference images. If Flow drifts (extra limbs, a different face), re-upload the Ingredients and add: "match the reference image exactly".

## Scenes

**Scene 1: the pile** (hooks A, main)
> [Sprout description] A messy student desk at night, lit by a warm lamp: stacks of notebooks, loose handouts, a laptop, a phone, sticky notes everywhere. Sprout peeks out from behind a stack of books, looks at the mess, then hops up onto the pile and waves at the camera. Camera: slow push-in at desk level. Mood: funny, slightly overwhelmed, then hopeful. No text.

**Scene 1b: Sprout hops in** (main, hook A)
> [Sprout description] Sprout hops from the left onto a wooden desk, wearing a small red baseball cap, lands with a little squash and bounce, and waves one arm at the camera with a big smile. Background softly blurred bedroom. Camera steady, slightly low angle. No text.

**Scene 2: stuck on a word** (hook B)
> Over-the-shoulder view of a student's hands holding a phone showing a page of a textbook (do not show a face), the page text out of focus except one word that glows softly in blue. Sprout, holding a big magnifying glass, sprints across the page towards the glowing word, leaving a tiny trail of sparkles. Camera: close, handheld feel. No readable text.

**Scene 3: the rope** (optional, if the real clip is not enough)
> [Sprout description] Sprout stands on a ledge, raises one arm with a small rope launcher on its wrist, fires a rope with a hook upward, then pulls hand over hand to haul a glowing card up from below. Playful, "tiny hero" energy. Camera: wide, slightly low. No text. (Do not mention any superhero by name in the prompt.)

**Scene 4: backflip** (hook C, main)
> [Sprout description] Sprout jumps and does a full backflip in the air on a clean pastel studio background, lands with its arms up, confetti bursts, a few gold sparkles. Slow-motion at the top of the jump. No text.

**Scene 5: asleep, then awake** (hook C)
> [Sprout description] Sprout is asleep with its eyes closed at a desk, small "z" bubbles floating up, a phone buzzing next to it, a glowing round timer light beside it. Sprout's eyes pop open, it jumps up, and gives a determined little fist pump. Camera: static, desk level. No text.

**Scene 6: dressed up** (main, optional)
> [Sprout description] Sprout wearing a golden crown, dark sunglasses and red-striped white sneakers strikes a confident pose, then does a small dance step. Plain soft gradient background. No text.

## Do and don't
- Do keep Sprout's colours: blue body, teal leaves, white face. The app's gold is only for rewards (the crown, sparkles).
- Do keep clips 5 to 8 seconds and cut between them quickly; the real app clips carry the proof.
- Don't show real student faces, school logos or any brand names in generated scenes.
- Don't ask for specific cartoon characters, studios or other mascots by name.
- Don't trust any on-screen text, numbers or app screens in a generated clip. Replace them with the real recordings and add words in Vids.

## Assembly in Google Vids (steps)
1. New video. Check the aspect ratio options; if there is no 9:16, work in 16:9 and cut vertical versions afterwards.
2. Add scenes in the order of the shot table in `SCRIPTS.md`. Upload the Flow clips, `clips/*.mp4` and `screens/*.png`.
3. Trim each real clip to the seconds in the table. Add a gentle zoom on the screenshots.
4. Add your voiceover (record it, or use Vids' AI voice), turn off every clip's own sound, add soft background music from the library.
5. Add captions for all spoken words, big and high-contrast, inside the safe area (leave the bottom 15% and top 10% free for platform buttons).
6. End card: the SunrootLearn name, "Start free" and the link, and one Sprout image (`01-sprout-hello.png` or `11-sprout-cap-and-glasses.png`).
7. Export at 1080x1920 if available.
