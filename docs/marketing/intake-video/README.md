# SunrootLearn Intake Film (2-Minute & 30s Social Cut)

Vertical 9:16 (1080x1920, 30 fps) film introducing SunrootLearn to newly admitted university students.

## Idea & Narrative
"Cramming gets you through the night; understanding is what stays."
New university students are tempted to memorise everything the night before exams, only to forget it a week later when next semester requires that foundation. SunrootLearn helps students actively understand, practice, and retain their coursework. Narrated by Sprout, the playful robot study buddy.

## Structure
- **Act 0: Welcome (0–16s)**: Congratulations on university admission. Sprout introduces himself.
- **Act 1: The Problem (16–56s)**: Dark, tense, relatable. The 11:00 PM panic, 40 pages of reading, the illusion of familiarity, the forgetting curve, and the crumbling foundation.
- **Act 2: The Solution (56–99s)**: Royal blue, inspiring. Note/slide/photo ingestion, tap-a-word rope grapple pull, active retrieval (flashcards/quizzes/labs), and the 10-minute focus sprint.
- **Act 3: Why Ours Is Better (99–128s)**: 3-row comparison ("Memorise tonight" vs "Understand for good"), diagnostic evaluation ("How am I doing?"), and confident exams.
- **Close (128–141s)**: Grand sunrise rings, glowing logo, slogan: "Understand it. Build it. Prove it.", Start free CTA.

## Pipeline Scripts
1. `voice.py` — Generates Sprout's robot voice lines using edge-tts (`en-US-AnaNeural` + pitch/rate modulation).
2. `build_audio.py` — Synthesizes procedural synthesizer soundtrack, adds SFX cues, ducking, and masters audio to -16 LUFS.
3. `render_fast.py` — Generates 1080x1920 scene stills and composites video cuts with ffmpeg.
4. `film2.html` / `sprout.js` — Interactive web-based rendering canvas.

## Exported Formats
- `sunroot_intake_2min.mp4` (9:16 vertical 1080x1920)
- `sunroot_intake_square.mp4` (1:1 square 1080x1080)
- `sunroot_intake_horizontal.mp4` (16:9 horizontal 1920x1080)
- `sunroot_ad_30s.mp4` (30s social ad cut-down)
