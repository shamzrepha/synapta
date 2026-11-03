# Brief for Antigravity: make Sunroot a universal study app

Repo: `shamzrepha/synapta` (Next.js 16, Firebase, Gemini). Pull `main` first. Do not commit `AGENTS.md`.
Run `npx tsc --noEmit`, `npx eslint .`, `npm run check:guards`, `npx vitest run` before every push.
Never invent metrics or users in any UI copy. Keep the brand: forest green `#12241C`, sun orange `#F28C28`, cream `#FBF6EC`; Space Grotesk and DM Sans.

## The problem, in the founder's words
1. Not every PDF is text. Many are **screenshots or scans of handwritten or printed notes**. The app must read those too.
2. Not every course needs a **lab, build, flashcards or simulation**. A student who wants to learn *engine math* or *Pythagoras' theorem* should not see a "Build it" or "Prove it" tab that makes no sense. **The app must decide what each topic needs and build only that.**
3. Sunroot is for **universal study**, not only electronics: maths, languages, history, law, biology, accounting, anything.
4. After a student uploads notes, AI should produce **clean, structured study notes** (topic, subtopic, key ideas, worked examples), like NotebookLM, and the student can **see animated, interactive teaching**. Maths must not be a plain textbook page: it should be a step-by-step animated, draggable explanation.

## What the code does today (so you know where to start)
- `lib/pdf/extractor.ts` pulls text with `pdfjs-dist` on the client only. A scan returns almost nothing and falls back to a useless string.
- `lib/teacher/materialIngest.ts` already detects `isScanned` (under 40 characters per page) but does nothing about it.
- `lib/notebook/types.ts` has `SourceType` including `image`, and `app/api/notebooks/[notebookId]/sources/route.ts` ingests sources. Notebook exists at `app/(app)/notebook/page.tsx`.
- The topic page `app/(app)/classes/[classId]/topics/[kcId]/page.tsx` has a **fixed tab list**: Read & listen, Simulation, Flashcards, Quiz, Prove it, Build & test, AI Tutor. Every topic shows all of them.
- Study tools exist under `app/(app)/study/*` (flashcards, mindmap, mistakes, papers, snap, exams, daily).
- Gemini access goes through `lib/ai/router.ts` (`generateWithFallback`); tasks are registered in `lib/ai/tasks.ts`. Run `npm run check:models` after touching models.

## Work packages (do them in this order, one PR each)

### 1. Read any PDF or photo (OCR and vision)
- Add a server-side reader: if a PDF page has little or no text, or the file is an image, send the page images to Gemini (vision) and get back clean text plus any maths as LaTeX, tables as markdown, and diagrams as a short description.
- Keep `pdfjs` text extraction as the fast path; only use vision for pages that need it, in batches, with progress ("Reading page 12 of 40").
- Handle handwriting, rotated pages, photos of a whiteboard, and mixed PDFs (some pages text, some scans).
- Store the extracted text once per source (content hash) and reuse it. Respect the existing quota and rate-limit guards (`lib/quota/guard`).
- Accept `.pdf`, `.png`, `.jpg`, `.heic`, `.docx`, `.pptx`, `.txt`. Show a clear error when a file can't be read, never a silent empty result.
- Tests: scanned-PDF detection per page, mixed document merge, and an image source producing text.

### 2. Subject-aware topics ("the app decides what this topic needs")
- When a topic is created (class builder, notebook or upload), classify it with one Gemini call into a `studyProfile`, for example:
  `{ subject: "maths", mode: "concept" | "procedure" | "memorise" | "language" | "practical" | "code" | "electronics", needs: { notes, animation, practice, flashcards, simulation, lab, prove, audio, tutor } }`.
- Store it on the KC. Teachers can override it in the topic editor.
- Make the topic tab list **data-driven from `needs`**. Pythagoras: notes, interactive animation, practice, tutor. Engine maths: notes, animated worked examples, practice, a calculator-style simulation, no circuit lab. Electronics: keep today's Simulation, Build & test and Prove it. History or law: notes, timeline or case summaries, flashcards, quiz, tutor.
- Remove "Prove it" and "Build & test" from topics that don't need them. Never show an empty tab.
- Show the profile to the teacher in plain words ("Sunroot built this as a maths topic: notes, animation, practice").
- Tests: profile classification for 10 sample titles, tab list per profile, teacher override wins.

### 3. Structured study notes (NotebookLM-style)
- From any source or topic, generate **study notes** with: title, one-paragraph overview, topics and subtopics, key terms, formulas (rendered with KaTeX), worked examples, common mistakes, "check yourself" questions, and a short summary.
- The student can ask Sunroot to **refine** the notes ("simpler", "more examples", "exam focus", "in Igbo"). Keep versions and let them restore one.
- Notes must cite the page of the source they came from; tapping a citation jumps to that page.
- Also offer: outline/mind-map view (`app/(app)/study/mindmap` exists), audio overview (existing podcast engine), flashcards and quiz **only when the profile needs them**.
- Notes follow the learner's language (the multilingual layer already exists: `lib/i18n/translate.ts`, `lib/i18n/languages.ts`).

### 4. Animated, interactive teaching
- Add a "Teach me" view that plays a **scene-by-scene lesson**: each scene has narration text (spoken with the existing voice engine), an animated visual, and a "try it" control.
- Build a small library of reusable, deterministic interactive blocks (no AI-generated code executed in the browser):
  - Maths: function grapher with sliders, geometry canvas (drag the triangle vertices to see a² + b² = c²), step-by-step equation solver that reveals one line at a time, number line, fractions, matrices, unit circle, calculus area under a curve.
  - Science: motion graphs, forces, waves, simple chemistry reactions, cell and organ diagrams.
  - Other subjects: timeline, map pins, flow diagrams, comparison tables.
- The AI does **not** write code. It writes a JSON "lesson script" (validated with zod) that picks blocks and fills their parameters. Reject and retry on invalid scripts, and fall back to a static explanation, never a blank screen.
- Every animation has play, pause, step forward and back, speed, and a text alternative for accessibility and low-data mode.
- Start with three subjects done well (Pythagoras and algebra, motion and forces, one memorise-type subject) before widening.

### 5. Universal onboarding and copy
- Remove electronics-only wording from the general UI (landing, dashboard, empty states). Electronics and robotics stay as one strong subject, not the whole product.
- Onboarding asks "What do you want to learn?" and lets the student type a topic, upload notes, or snap a page. The app builds the right study set from that.
- Update `SUNROOT-BRIEF.md`-style product copy only with facts that are true after these packages ship.

## Definition of done for each package
- Works on a phone, in all supported languages, and in low-data mode.
- Failure never shows an empty page: always a readable fallback and a retry.
- Tests added next to the code; no skipped tests; lint has 0 errors.
- No new secrets in the repo; keys stay in `.env.local`.
