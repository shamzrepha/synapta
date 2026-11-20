# SunRootLearn: Feature inventory (verified by reading the repository)

This file joins two parts written by two reviewers. Part 1 covers learning, academic and interactive features and Sprout. Part 2 covers social,
institutional and commercial features and the lecturer and student journeys. Nothing was run in a browser: statuses come from tracing code, so a
status of "Working" means the code path exists end to end, not that it was seen working in production. Confidence levels: HIGH = read in code,
MEDIUM = several code paths agree, LOW = inferred, UNKNOWN = could not establish.

---

# PART 1 - Learning, academic, interactive features and Sprout

# Feature inventory, part 1: learning, academic, interactive, Sprout

Scope: learning/academic and interactive features plus the Sprout mascot, as found in the repo at branch HEAD (`e3eb258`, Nov 18 2026).
Method: static reading only (git grep, cat). Nothing was run, built or called. "Verified" below means the code path was read end to end; it does NOT mean it was exercised in production. Line numbers are deliberately omitted; function and file names are exact.

Status vocabulary: Production / Working / Partial / Prototype / UI only / Planned / Broken / Unknown.
Confidence: HIGH / MEDIUM / LOW / UNKNOWN.

---

## 0. Cross-cutting facts that apply to many features

### 0.1 The publication model (lib/classes/published.ts, lib/classes/live.ts)

- Four publish keys: `lesson`, `audio` (podcast), `simulation`, `practice` (flashcards + quiz). Stored on the topic doc `classes/{classId}/kcs/{kcId}.contentPublished`.
- Three read modes via `liveMode()`: `off` (key missing/false on a map that exists), `follow` (value `true`, or no map at all: the student reads the teacher's WORKING copy live), `snapshot` (value is `{fp, at}`: student reads the pushed copy, e.g. `kc.liveLessonMarkdown`, `kcs/{kcId}/live/{audio|simulation|quizBank|flashcardBank}`).
- `pushToStudents()` snapshots a key; `takeOffline()` sets it false; `liveStatus()` computes `changed` via a fingerprint; `lib/classes/publish-all.ts` `pushClassContent()` is used by "Publish class" (`POST /api/classes/{id}/publish`) and "Publish all content" (`/publish-content`).
- Topics created via `POST /api/classes/{id}/kcs` and `lib/teacher/kcStore.ts` start with `draftMap()` (everything draft). That is the safe path.

**Findings on the publication model (all Verified by reading, HIGH confidence):**

| # | Finding | Evidence | Impact |
|---|---|---|---|
| P1 | AI-built topics skip the draft map. `buildClassWithAi` writes kc docs with `status:"draft"` but NO `contentPublished`. `liveMode()` treats a missing map as `follow`. Once the teacher presses "Publish class", `status` flips to `published` and every key is already `follow`, so every later regenerate/edit of lecture note, podcast, simulation, quiz bank reaches students instantly with no snapshot. `pushClassContent()` explicitly skips `follow` topics (`if (s.mode === "follow" ...) continue`). | `lib/teacher/classBuilder.ts` (kcDoc literal), `lib/classes/live.ts` `liveMode`, `lib/classes/publish-all.ts` | The "teacher reviews then pushes" promise (like git) silently does not apply to the main creation path (class_build). Unfinished AI drafts can be shown. |
| P2 | Same hole for topics added by applying a material proposal (`add_kc` in `lib/teacher/materialRouter.ts`, sets `status:"published"`, no `contentPublished`, no lesson) and for topics from the legacy `POST /api/classes/{id}/syllabus/generate` (random doc ids, no `status`, no `contentPublished`, ships AI `lessonMarkdown` straight into a live class). | those two files | Students can see empty or unreviewed topics. |
| P3 | "Take offline" does not take practice offline. Student quiz and flashcard routes fall back to the teacher's working bank when the published bank is empty (`if (!bank.length) bank = await readQuizBank(...)`, then `ensureQuizBank` on the class owner's AI budget). Code comment says this is intentional ("Self-test quizzes are open to every member"). | `app/api/ai/quiz/route.ts`, `app/api/ai/flashcards/route.ts` | The `practice` switch is cosmetic for self-test. Also a student's first visit can spend the TEACHER's AI budget (`classOwner()`), contradicting "students never trigger generation". |
| P4 | Pieces labs and quests share the `simulation` key but are read from the working copy for students. `pushToStudents("simulation")` snapshots only the main sim doc. `pieces/route.ts` and `quests/route.ts` GET use `isPublished()` (boolean) then `getStoredPieces/getStoredQuests` (working copy). `draftOf` fingerprints include pieces/quests, so the teacher sees "changed" resolve after a push that did not actually snapshot them. | `lib/classes/live.ts`, `app/api/classes/[id]/kcs/[kcId]/pieces/route.ts`, `.../quests/route.ts` | Edits to piece labs/quests go live immediately once the simulation key is pushed once. |
| P5 | `POST .../quests/complete` has no `assertPublished`/publication check; any enrolled member who knows a piece index and has a stored (even draft) quest can request mastery credit, though credit requires server-recorded solved challenges. | `.../quests/complete/route.ts` | Low. |
| P6 | Stale comments mislead maintainers: `audio/route.ts` doc says "Students can trigger the first recording" but the code returns 403 for non-teachers; the topic page loop says "Another learner triggered it a moment ago" though students cannot trigger `lesson`. | those files | Low. |

### 0.2 The AI call chain (what "quota" really means)

`generateWithFallback()` (lib/ai/router.ts): `aiPaused` admin kill switch (`getSiteConfig`) -> add learner language (`withLearnerLanguage`, unless `learnerLanguage:false`) -> inject Learner DNA for personal tasks (`shouldInjectLearnerDna`) -> `reserveQuota()` (monthly token reservation, lib/quota/guard.ts) -> `generateWithFallbackInner` (aiCache lookup only if `cacheKey`; provider = openrouter / groq / gemini chain) -> `settleQuota` or `releaseQuota`. `checkRateLimitAndQuota()` is the extra admission check (per-minute shared limit + monthly budget). `checkFeature()/recordFeature()` (lib/billing/usage.ts) is the separate plan allowance, only active when `isEnforced(uid)` (billing switched on).

Findings (Verified, HIGH unless stated):

| # | Finding | Evidence |
|---|---|---|
| Q1 | Only ONE call site in the whole repo passes `cacheKey` (studio ideas, `lib/studio/ai-build.ts`). The `aiCache` collection is effectively unused for learning content. "Cache" for lessons/quizzes means "persisted result on the topic doc/bank", not a content-hash cache. Two students asking the same question each cost tokens. | `grep cacheKey:` |
| Q2 | `checkFeature` is called for only 4 of the 6 declared plan features: `notes`, `lessons`, `practice`, `scan_pages`. `studio_ai` and `class_build` are declared in `lib/billing/plans.ts` and advertised in plan perks ("40 Maker Studio circuit and 3D hardware builds") but never enforced anywhere. | `grep checkFeature(` |
| Q3 | Worlds uses a parallel AI stack (`lib/ai/structured/generate.ts` -> adapters for Gemini/Groq/OpenRouter) that never calls `reserveQuota`, `checkRateLimitAndQuota`, the `aiPaused` kill switch or the OpenRouter daily cap. Only per-minute `checkRateLimit` guards `/api/worlds/*`. A learner can run unlimited world builds (extract, OCR vision, audit) and tutor calls outside any monthly token budget. | `app/api/worlds/**`, `lib/worlds/**`, `lib/ai/structured/*` (no quota imports) |
| Q4 | `generateStructuredJson()` (lib/gemini/client.ts) calls `generateWithFallback` WITHOUT `userId`, so no reservation and no kill-switch check; the three callers (`syllabus/generate`, `diagnostic/start`, `classes/[id]/map` daily teacher note) record tokens after the fact. It also throws if the Gemini key is empty/placeholder even when the active provider is Groq/OpenRouter. | `lib/gemini/client.ts`; callers. Whether this breaks a given deployment depends on its keys (Unknown). |
| Q5 | 12 task ids in `lib/ai/tasks.ts` are never used by any call: `material_route`, `assignment_architect`, `assignment_author`, `assignment_reviewer`, `notebook_chat`, `notebook_artifacts`, `source_guide`, `paper_analysis`, `flashcard_gen`, `research_plan`, `class_study_guide`, plus `embedding`/`transcribe`/`voice_tts` (non-chat). The admin model-routing UI exposes them; changing the model for `notebook_chat` etc. does nothing because the real calls use `tutor_chat`/`structured_spec`/`long_document`. | `grep` of each id |
| Q6 | Most "shared content" generators use the generic `structured_spec` task (quiz banks, flashcard banks, assignments, material routing), so one admin model choice governs many different quality levels. | `lib/practice/bank.ts`, `lib/teacher/*` |

---

## 1. Feature table (summary)

| # | Feature | Status | One-line verdict |
|---|---|---|---|
| 1 | AI class creation (`class_build`) | Working (with defects) | Real pipeline; rebuild can overwrite lessons; skips draft map (P1) |
| 2 | Syllabus + slide/material ingestion | Working / Partial | Two parallel paths; client-side parse, server AI routing |
| 3 | Class publishing | Working for manually-created topics; Partial for AI-built | See P1-P4 |
| 4 | Topic / KC management | Working | Teacher CRUD, prerequisites DAG, parent tree |
| 5 | Interactive textbook reader (flip pages, KaTeX) | Production-looking | Strongest reader; Mermaid absent |
| 6 | PDF and document reading | Working | Client pdf.js + docx/pptx + vision OCR fallback |
| 7 | Lesson notes (class) | Working | Teacher-only generation; student reads published copy |
| 7b | Student personal AI notes (`/study/notes`) | Working | Versioned, plan-gated |
| 8 | AI tutor | Working | Real grounding; "streaming" is cosmetic; persistence is write-only |
| 9 | Quiz generation + practice | Working | Bank-based, no AI per quiz |
| 10 | Past questions + CBT | Broken (solve) / Working (CBT shell) | Solver call has no schema, always 502 |
| 11 | Flashcards | Working | Bank + personal decks |
| 12 | Spaced repetition | Working | `ts-fsrs` for personal cards only |
| 13 | Mistake notebook | Working | Written by quiz + daily; retest list |
| 14 | Misconception detection | Partial | Two sources only; used by tutor prompt + map |
| 15 | Learning recommendations | Working | Deterministic path + one cached AI sentence |
| 16 | Student evaluation | Working | Hash-cached AI + numeric fallback |
| 17 | Learning analytics / heatmap | Working | Teacher-only, deterministic |
| 18 | Audio lessons / podcasts | Working | Base64 in Firestore; teacher-gated |
| 19 | Notebook | Working | Keyword retrieval, not embeddings |
| 20 | TTS (Edge, OpenRouter voice) | Working | Unofficial Edge endpoint; no server cache for live reads |
| 21 | Sprout reading assistant | Working | Strongest differentiator in slice |
| 22 | Simulation labs (AI HTML sims, SimKit3D) | Working | Sandboxed; teacher-built |
| 23 | Studio bench (circuits/Arduino/mechanisms) | Working (large) | Deterministic checker engines |
| 24 | Blockly | Working | Blocks -> Arduino/JS in Studio |
| 25 | Three.js experiences | Working | Studio viewer + sim runtime |
| 26 | Mermaid diagrams | UI illusion | Dependency never imported |
| 27 | Chemistry workbench / experiments | Working, small | 4 hand-coded experiments + workbench game; no mastery link |
| 28 | Engineering simulations | Working | Part of Studio (drive/mech/circuit) |
| 29 | Quests (per-topic) | Working | Server-graded, credits mastery once |
| 29b | Seasonal/daily quests (`lib/quests`) | Working, hard-coded | Season dates are constants |
| 30 | Worlds | Partial/Prototype-in-prod | Rich pipeline, outside quota (Q3) |
| 31 | Interactive challenges (events) | Working, out of slice depth | `lib/events`, `/challenges` |
| 32 | Content-cache approval pipeline (`contentCache`) | Prototype / dead end | Output never reaches students |

---

## 2. Feature detail

Format per feature: Status, Frontend, Backend, Database, AI, Dependencies, Permissions, Publishing, Limitations, Evidence. Confidence is stated per status.

### 2.1 AI class creation (`class_build`)
- **Status:** Working, with three defects. Confidence HIGH (read end to end).
- **Frontend:** class create wizard and class page build progress bar (`app/(app)/classes/...`, `buildState/buildStep/buildPct` mirrored on the class doc). `components/studio/class-build-assignments.tsx` is the assignments side only.
- **Backend:** `POST /api/classes/{id}/build` (`requireUser(["teacher","admin"])`, `assertClassAccess(...,"mutate")`, `parseClassBuildRequest`, `saveSeedAsMaterial`) -> `buildClassWithAi()` in `lib/teacher/classBuilder.ts`. Resume: `GET/POST /api/classes/{id}/build/{jobId}`. Also `lib/teacher/recommend.ts` reuses the `class_build` task id for simulation ideas.
- **Database:** `classes/{id}` (buildState, buildStep, buildPct, buildClarifications, lastBuildKcCount), `classes/{id}/buildJobs/{jobId}` (step, pct, status, input for resume), `classes/{id}/kcs/{slug}` (title, objectives with Bloom tags, prerequisiteIds, parentId, bkt priors, difficulty, lab, sourceMaterialIds, status:"draft", source:"ai_topic"), reads `classes/{id}/materials` `extractedText`.
- **AI:** `class_build` via `executeStructuredAiTask` with `classPlanSchema` (min 1, max 60 KCs; prompt asks 8-50), `estimatedTokens:3500`, `learnerLanguage:false`. Provider per router (Gemini/Groq/OpenRouter chain). Library text sampled to ~90k chars (`PER_DOC_BUDGET`), seed text sanitized by `sanitizeUntrustedPromptText`.
- **Dependencies:** materials uploaded first (otherwise built from title/description); BKT priors `deriveBktPriors`; cycle pruning `validateAndPruneCycles`.
- **Permissions:** teacher/admin owner only. No route-level `checkRateLimit` (relies on `checkRateLimitAndQuota` inside `executeStructuredAiTask`). `class_build` plan feature is declared but not enforced (Q2).
- **Publishing:** creates topics as `status:"draft"` (hidden from students by the class GET filter) but WITHOUT `contentPublished` -> follow mode after publish (P1).
- **Limitations / defects:**
  1. Re-running a build with the same titles uses stable slug ids and `batch.set(..., {merge:true})`. The first 3 topics always get a stub `lessonMarkdown` in the same write, so a rebuild overwrites an already AI-written lecture note with the stub. It also resets `status` to `draft`, `contentVersion` to 1 and `createdAt`. Data-loss risk. (Verified by reading; not exercised.)
  2. Hard cap 60 KCs in schema vs "8 to 50" in prompt; a model returning >60 fails validation and the build is marked failed.
  3. The lab assignment is limited to 4 hard-coded lab types (`rc_filter`, `ohms_law`, `logic_gates`, `projectile`) plus `none`.
  4. Quota exhaustion is handled (`AiQuotaExhaustedError` -> `waiting_quota` job with `resumeAt`) but I found no scheduler that auto-resumes; resume is a manual `POST .../build/{jobId}` (assumption: no cron picks it up; I did not check `vercel.json` crons in depth).
- **Evidence:** `lib/teacher/classBuilder.ts`, `app/api/classes/[id]/build/route.ts`, `.../build/[jobId]/route.ts`, `lib/teacher/classBuildRequest.ts`.

### 2.2 Syllabus and slide/material ingestion
- **Status:** Working but duplicated. Confidence HIGH for routes, MEDIUM for UI polish.
- **Frontend:** `app/(app)/classes/[classId]/syllabus/page.tsx` (414 lines, reachable from the class page link); `app/(app)/classes/[classId]/manage/content/page.tsx`; upload UI `components/shell/add-material.tsx`; teacher uploader. Client-side extraction in `lib/pdf/extractor.ts` (pdf.js, docx/pptx via `lib/documents/office.ts`, images -> vision).
- **Backend:** `POST /api/classes/{id}/materials` (JSON text up to 2,000,000 chars, SHA-256 hash, then `analyzeMaterialAndRoute`), `POST /materials/init` + `.../{mid}/complete` (Firebase Storage download, `%PDF-` magic-byte check, dedupe by `contentHash`, `ingestMaterialBuffer` in `lib/teacher/materialIngest.ts`), `GET/proposals`, `proposals/{pid}/apply|dismiss`, `replan`. Legacy `POST /syllabus/generate`.
- **Database:** `classes/{id}/materials/{mid}` (title, extractedText, contentHash, status, proposalId), `mapProposals`, `mapVersions` (snapshot before apply, for rollback), `kcs`.
- **AI:** material routing uses `structured_spec` (`lib/teacher/materialRouter.ts`; the declared `material_route` task is unused, Q5). Syllabus uses `generateStructuredJson` default `structured_spec` (Q4).
- **Dependencies:** pdfjs-dist, edge of vision OCR `/api/documents/read` (`long_document`, plan feature `scan_pages`).
- **Permissions:** teacher/admin on write; `GET materials` also teacher/admin only.
- **Publishing:** proposals applied with `add_kc` create `status:"published"` topics with no draft map (P2).
- **Limitations:** No route-level `checkRateLimit` on `materials` POST, which runs an AI call. Two ingestion philosophies live side by side (class_build library sampling vs proposals/apply vs legacy syllabus generate). Slide ingestion = pptx text extraction only (`readPptx`); slide images/diagrams are not read unless the teacher uploads page images.
- **Evidence:** files above.

### 2.3 Class publishing
- **Status:** Working. Partial guarantee (see 0.1). HIGH.
- **Frontend:** `components/lesson/publish-bar.tsx`, `components/lesson/practice-bank-tools.tsx`, class manage page.
- **Backend:** `POST /api/classes/{id}/publish` (DAG cycle check, flips all non-archived kcs to `published`, then `pushClassContent`, notifies active students via `notifyMany`), `/publish-content`, `POST /kcs/{kcId}/publish` (push/offline per key).
- **Database:** `kcs/{kcId}.contentPublished`, `liveLessonMarkdown`, `kcs/{kcId}/live/{audio|simulation|quizBank|flashcardBank}`, class `status`, notifications.
- **Publishing:** this IS the gate. See P1-P6.
- **Limitations:** `lesson` must be >=200 chars to count as a draft (`draftOf`). Audio push refuses incomplete recordings (`AUDIO_INCOMPLETE`), a good guard. Labs publish via `labs[].published` and `snapshotLabDesign`.

### 2.4 Topic / knowledge-component management (kcs)
- **Status:** Working. HIGH.
- **Frontend:** class page mind map `components/classes/class-mind-map.tsx`, `learning-map.tsx`, `app/(app)/classes/[classId]/map/page.tsx`, topic page `topics/[kcId]/page.tsx` (960 lines).
- **Backend:** `POST /api/classes/{id}/kcs` (teacher, `safeParse`, `kcStore`), `/kcs/{kcId}` GET/PATCH/DELETE, `/kcs/{kcId}/profile`, `lib/classes/mind-tree.ts`, `lib/kc/context.ts` `loadKcGroundingContext` (grounding for ALL generators: topic title, objectives, `lessonMarkdown`, top excerpts from `sourceMaterialIds` materials, sanitized, 30k char cap).
- **Database:** `classes/{id}/kcs/{kcId}`; `mastery/{uid}_{kcId}` (pL, attempts, correct); `misconceptions`.
- **Limitations:** `loadKcGroundingContext` always feeds the TEACHER'S working `lessonMarkdown` (not the pushed snapshot) into generators; fine for teacher-triggered generation, but the student-triggered quiz-bank path (P3) therefore grounds on unpublished drafts. Keyword (not semantic) excerpt selection in `selectRelevantExcerpt`: `kws.filter(w => w.length > 3)` splits on `[^a-z0-9]+`, so non-Latin-script topics (e.g. Hausa fine, but Arabic/Chinese titles) yield no keywords and fall back to `text.slice(0, budget)` (MEDIUM, reasoned from code).

### 2.5 Interactive textbook reader (flip pages, KaTeX)
- **Status:** Production-quality UI. HIGH for existence, MEDIUM for runtime (not run).
- **Frontend:** `app/(app)/classes/[classId]/read/page.tsx` (1,450 lines: flipbook pages, page budget via `lib/study/page-fit.ts`, `splitTextbookPages`, class mind map, progress cheer), `components/lesson/interactive-note.tsx` (1,129 lines: tappable glossary terms, term sheet, Sprout choreography), `components/study/flipbook-notes.tsx`, `components/markdown/markdown-renderer.tsx` (react-markdown + remark-math + rehype-katex + remark-gfm, `normalizeMath`), `components/lesson/find-block.ts`, `lib/study/*` (note-pages, note-sections, locate, read-queue, word-sync).
- **Backend:** content from `GET /api/classes/{id}?kc=` (`lessonForStudents`, translated by `localizeFor`); `POST /api/classes/{id}/read/signal` (checkRateLimit, reading telemetry -> evidence/mastery); `GET /api/study/term|terms|glossary` (`explain_selection`, glossary cached at `kcs/{kcId}/glossary/current`).
- **Database:** `kcs.lessonMarkdown/liveLessonMarkdown`, `kcs/{kcId}/glossary/current`, read signals.
- **AI:** `lesson_notes` (generation, teacher), `explain_selection` (terms/glossary/mindmap explain).
- **Permissions:** class member; draft topics hidden.
- **Publishing:** respects snapshot via `lessonForStudents` (but see P1).
- **Limitations:** relies on CSS Custom Highlight API for word highlighting (`reading-follow.ts` checks `CSS.highlights`; degrades silently). KaTeX server-side `rehype-katex` renders HTML+MathML; reading-follow explicitly excludes `.katex-mathml` so math is not read aloud word by word. Diagrams: see 2.26.

### 2.6 PDF and document reading (lib/pdf, lib/documents)
- **Status:** Working. HIGH.
- **Frontend/lib:** `lib/pdf/extractor.ts` (client-side pdf.js per page via `pageText`, then vision OCR for pages that need it using `pageNeedsVision` and up to `MAX_VISION_PAGES` in `VISION_BATCH`es), `lib/pdf/page-text.ts` (`friendlyReadError`, iPhone fix in latest commit `e3eb258`), `lib/documents/office.ts` (`readDocx`, `readPptx`), `outline.ts`, `pages.ts`.
- **Backend:** `POST /api/documents/read` (`requireUser`, `checkRateLimit` 30/min, `checkFeature("scan_pages", n)`, `checkRateLimitAndQuota(3000*n)`, `generateWithFallback` task `long_document`, `recordFeature`).
- **Limitations:** JPEG downscaling (`toJpegDataUrl` to <=1800px, <2.8M chars data URL) loses fine print on equations; vision OCR output is plain text, so math layout is lost. Image files go straight to vision (cost). `lib/pdf/extract.ts` is a one-line re-export.

### 2.7 Lesson notes (class lecture notes)
- **Status:** Working. HIGH.
- **Frontend:** topic page auto-calls generate when `canManage && lessonIsThin` (so opening a stub topic as the teacher spends AI automatically, `autoLessonTried`), `components/lesson/textbook-writer.tsx`, `lesson-editor`.
- **Backend:** `POST /api/classes/{id}/kcs/{kcId}/lesson` -> `generateLessonForKc()` (`lib/lesson/generate.ts`): Firestore transaction lock (`lessonGeneratingAt`, 3 min `LOCK_MS`), `checkRateLimitAndQuota(14000)`, `loadKcGroundingContext(materialBudget 24000)`, tree placement `placeInTree` (chapter numbering), `textbookSystemPrompt` + `designSpec("common","lesson")`, `generateWithFallback task:"lesson_notes"`, `maxOutputTokens:16000`, `learnerLanguage:false`. After success the route schedules `ensureQuizBank` + `ensureFlashcardBank` with `after()`.
- **Database:** `kcs/{kcId}`: `lessonMarkdown, lessonStyle, lessonNumber, lessonGeneratedAt, lessonGeneratingAt, contentVersion`.
- **Permissions:** `assertClassAccess("view")` then hard 403 if not `canMutate`. Students never generate.
- **Publishing:** draft until pushed (`liveLessonMarkdown`) except P1 topics.
- **Limitations:** Rejects output <1200 chars. No route-level `checkRateLimit` (only the quota admission). Auto-generation on open means a teacher visiting 40 stub topics can trigger 40 x 14k-token calls (unthrottled except the 60/min teacher cap in `guard.ts`). Stub lessons (first 3 topics) are <600 chars so `isThinLesson` is true.

### 2.7b Student personal AI notes (`/study/notes`)
- **Status:** Working. HIGH.
- **Frontend:** `app/(app)/study/notes/page.tsx`, `components/study/note-practice.tsx`, `flipbook-notes.tsx`.
- **Backend:** `POST /api/study/notes` (`requireUser`, `checkRateLimit` 6/min, zod `createSchema` min 40 chars/max 1,000,000, cap 60 sets, `checkFeature("notes")`, `checkRateLimitAndQuota(9000)`, `generateWithFallback task:"study_guide"` with `appendLearnerAudience`, save + `addVersion` + `recordFeature`). `/study/notes/{id}` (versions, revert, page text), `/study/notes/{id}/practice` (`checkFeature("practice")`).
- **Database:** `studyNotes` (uid, title, head, sourceText) + versions (`lib/study/notes-store.ts`).
- **Limitations:** the full `sourceText` (up to 1.25M chars) is stored on the doc, so Firestore doc size limit (1 MiB) will reject large sources at write time AFTER the AI cost was paid (reasoned from `ref.set({... sourceText ...})`, MEDIUM; not exercised). No dedupe of identical sources.

### 2.8 AI tutor (`tutor_chat`)
- **Status:** Working. HIGH for the chain, MEDIUM for quality (no eval run; `scripts/eval-tutor.ts` exists).
- **Frontend:** `app/(app)/tutor/page.tsx`, `tutor/voice`, `components/tutor/tutor-chat.tsx`, `tutor-launcher.tsx` (panel opened by tapping Sprout via `ASK_EVENT`), `voice-tutor.tsx`, topic page chat, `/api/snap` photo tutor.
- **Backend:** `POST /api/ai/tutor` (`requireUser`, zod body: classId/kcId optional, message<=4000, history<=40 x 20k chars) -> `runTeacherAgent()` (`lib/teacher/orchestrator.ts`): `checkStudentMessageSafety`, `checkRateLimitAndQuota(1200)`, mode topic/class/general, loads kc + mastery + open misconceptions, `lessonForStudents` for students (drafts never leak), explain-level and audience tags, `generateWithFallback task:"tutor_chat"` `maxWaitMs:12000`.
- **Database:** reads `mastery`, `misconceptions`; writes `tutorThreads/{uid_class_kc}/messages` (write-only: nothing in the repo reads `tutorThreads`).
- **AI:** `tutor_chat`; misconception tag `[[misconception: label]]` stripped from the reply and fed to `trackMisconception` + `recordAdaptiveSignal`; calculator tag `[[tool:calculator|...]]` opens the Sprout overlay calculator.
- **Limitations / illusions:** (a) The reply is returned as one `Response(result.reply)`; the client reads it with a stream reader, but there is no server streaming, so the "typing" is not real token streaming. (b) No route-level `checkRateLimit` on `/api/ai/tutor` (quota admission only). (c) Conversation history is client-supplied, not server-loaded; `tutorThreads` is audit-only. (d) Misconception detection relies on the model volunteering a tag at the end of a reply: untested reliability (Unknown). (e) The tutor does not check the topic is published for students beyond lesson text; for an unpublished topic it falls back to `kc.description`.

### 2.9 Quiz generation and practice questions
- **Status:** Working. HIGH.
- **Frontend:** `components/quiz/quiz-player.tsx` (confetti + `fireCelebration`, no Sprout), topic page, practice-bank-tools (teacher review).
- **Backend:** `POST /api/ai/quiz` (checkRateLimit 20/min, zod, `assertClassAccess("view")`, bank resolution per P3, `getSeen/setSeen` for unseen-first selection, `loadLearnerDna` + `pickAdaptiveQuizFocus`, creates `quizSessions/{id}` with answers server-side), `POST /api/quiz/{sessionId}/answer` (transactional answer lock, `applyEvidenceIfEnrolled` for mastery/XP, `recordMistake`, `trackMisconception`, `recordAdaptiveSignal`).
- **Database:** `kcs/{kcId}/practice/quizBank` (questions, version, generatedBy, generatingAt lock), `quizSessions`, `mastery`, `mistakes`, `misconceptions`, `users/{uid}/seen`.
- **AI:** `structured_spec` x3 parallel batches (`QUIZ_BATCHES`, `estimatedTokens 400*count`) in `ensureQuizBank`, bank of 60+ questions generated ONCE per topic; zero AI per quiz. `isPrivileged:true` bypasses the student tier.
- **Limitations:** `distractorMisconceptions` come from the generator and are not human-verified; the in-code comment calls the bank "verified" but I found only schema/normalization checks (`normalizeQuizQuestions`), not an answer-correctness verifier (MEDIUM). Quiz answers are public once `correctIndex` is stored on the session doc server-side only, which is correct (client gets `question/options` only).

### 2.10 CBT and past questions
- **Status:** CBT shell Working; AI solver Broken; handwritten grader Working (HIGH on the break).
- **Frontend:** `app/(app)/classes/[classId]/past-questions/page.tsx` (modes `study` | `cbt` | `handwritten`; CBT has timer, index navigation, tab-switch "focus lock" warnings via `cbtFocusWarnings`).
- **Backend:** `GET/POST/PUT /api/classes/{id}/past-questions` (GET strips `solution/cohortSolutions` for free users, `hasExamAccess` = plans plus/exam/teacher or role teacher/admin; 1 free preview via `assertPreviewAllowed`; POST `action:"grade_handwritten"` uses `grading_high_stakes` with schema; POST solve uses `quiz_gen`; PUT teacher bulk-scan uses `structured_spec` with schema).
- **Database:** `classes/{id}/pastQuestions/{id}` (questionText, topic, solution, cohortSolutions, cohortFeedback, peerMedianMs), `users/{uid}/pastQuestionAttempts`, `users.telemetryProfile`.
- **BROKEN (Verified HIGH by reading, not executed):** the solve branch calls `generateWithFallback({ task:"quiz_gen", systemInstruction, userPrompt, temperature, userId })` with NO `schema`. In the router, `data` is only populated when a `schema` is passed (`parsedData` stays undefined otherwise). The next line is `if (!result.data) throw ApiError(502, "AI_GENERATION_FAILED")`. So every cache MISS fails with 502. Only already-cached cohort solutions (and the sample questions answered from cache, if any) can ever be returned. The prompt also asks for JSON including `cbtBlock`, so CBT blocks generated through this path never exist either. `route.test.ts` mocks `generateWithFallback` to return `{data: solution}`, which is why CI is green. This is the headline paid feature (Naira 1,500 Exam Pass).
- **Impact:** paying exam subscribers hit an error on any question whose solution is not already cached; teacher-uploaded questions have no stored solution until a solve succeeds.
- **Recommendation:** pass a zod `schema` (the shape is spelled out in the prompt) or use `executeStructuredAiTask`; add a non-mocked contract test that asserts a `schema` is supplied.
- **Other:** page copy says "Sprout automatically upgraded this cohort explanation" (self-healing is a counter `evaluateCohortHealth`, not a visible Sprout action); AI persona string "You are Sprout" appears in this prompt only.

### 2.11 Flashcards
- **Status:** Working. HIGH.
- **Frontend:** `app/(app)/study/flashcards`, topic page flashcards panel.
- **Backend:** class flashcards `POST /api/ai/flashcards` (bank, same publication fall-through as P3); personal decks `GET/POST /api/flashcards` (kind class|notebook|text, 8/hour `checkRateLimit`), `/flashcards/{deckId}`, `/flashcards/cards/{cardId}`, `/flashcards/sources`, `/flashcards/review` (240/10 min). Generator `lib/flashcards/generate.ts` (task `card_gen`, `clean.ts`, `serde.ts`).
- **Database:** `kcs/{kcId}/practice/flashcardBank`, personal decks/cards collections, `flashcardStats/{uid}`.
- **AI:** class bank uses `structured_spec` (2 halves, 20 cards each); personal decks `card_gen`; `flashcard_gen` (legacy id) unused (Q5).

### 2.12 Spaced repetition (location only; maths audited elsewhere)
- `lib/fsrs/scheduler.ts` wraps `ts-fsrs` (`fsrs(defaultParams)`, `scheduleCardReview`, `isCardDue`). Applied only to PERSONAL flashcards through `POST /api/flashcards/review` -> `reviewStored` -> card doc `fsrs` field, then `flashcardStats` and `trackProgress`.
- Class flashcards (bank) are served by "unseen first" (`lib/practice/bank.ts pickForLearner` + `lib/practice/history.ts`), not by FSRS. Mistake retest uses a separate counter rule (`lib/mistakes/logic.ts afterWrongAnswer`, 2 consecutive corrects). Mastery uses BKT (`lib/bkt/engine.ts`, `MASTERY_THRESHOLD`). So three different "memory" models coexist: FSRS (cards), BKT (topics), counter (mistakes), and they do not feed each other (apart from evidence -> BKT).

### 2.13 Mistake notebook
- **Status:** Working. HIGH.
- **Frontend:** `app/(app)/study/mistakes`; retest mode.
- **Backend:** `GET /api/study/mistakes` (filters, `retest=1` returns top 10 by `wrongCount`, mastered excluded), `/mistakes/{id}`; writers: quiz answer route (`recordMistake`, source `quiz`) and daily (`source:"daily"`). `lib/mistakes/store.ts`, `logic.ts` (`mistakeKey`, `afterWrongAnswer`).
- **Database:** mistakes collection (question, options, correct/student answers, wrongCount, retestCorrect, mastered).
- **Limitations:** MCQ only; mistakes from assignments, past questions, labs, worlds or flashcards are NOT captured (only `quiz|daily`). No AI. `GET` loads all of a user's mistakes then filters in memory.

### 2.14 Misconception detection
- **Status:** Partial. MEDIUM.
- **Sources:** (1) quiz `distractorMisconceptions[selectedOptionIndex]` (generator-authored labels), (2) tutor `[[misconception: ...]]` tag, (3) diagnostic answers (`/api/diagnostic/{sessionId}/answer`).
- **Backend:** `lib/teacher/misconceptions.ts` (`trackMisconception`, `evaluateMisconceptionTransition`: +1 occurrence on wrong, resolved after 2 consecutive correct on the KC, regardless of whether the correct answers relate to the misconception).
- **Database:** `misconceptions` (uid, classId, kcId, label, occurrences, consecutiveCorrect, resolved).
- **Consumers:** tutor system prompt ("Open misconceptions"), `classes/{id}/map` (count per KC, `misconceptionCount`), Learner DNA (`lib/adaptive/learner-dna.ts`), `/api/me/learner-state`.
- **Limitations:** Resolution rule is crude (any 2 correct answers on the KC resolve every open misconception on it). No teacher-facing misconception view found in the heatmap route (heatmap shows pL only). Labels are free text, so duplicates are normalized only by `sanitizeMisconceptionId`.

### 2.15 Learning recommendations
- **Status:** Working. HIGH.
- **Frontend:** `components/classes/learning-map.tsx`, class map page.
- **Backend:** `lib/classes/recommend-next.ts` (deterministic: constants `MASTERED .95`, `SOLID .7`, `WEAK .4`, kinds start/strengthen/next/done; never locks), `GET /api/classes/{id}/map` (nodes, edges, `recommendedPath`, `paceWeeks`, one cached AI "teacher note" per user/class/day in `learnerPlans/{uid_class_date}` via `generateStructuredJson`; deterministic fallback text on failure), `/classes/{id}/goal`, `/replan`.
- **Limitations:** a GET route that can trigger an AI call (cached per day) with the Q4 quota bypass. `GET /api/classes/recommend` (teacher) is a different feature (teacher-side suggestions).

### 2.16 Student evaluation
- **Status:** Working. HIGH.
- **Frontend:** `app/(app)/study/evaluation`.
- **Backend:** `GET/POST /api/study/evaluation`: checkRateLimit 4/min, `gather()` from `mastery`, mistakes, kcs; `hasEnoughEvidence` gate; `evidenceSignature` hash -> returns saved evaluation free when nothing changed (the only genuine "cache" for AI in this slice); AI `student_evaluation` with `evaluationSchema`; on any AI failure writes `fallbackEvaluation(summary)` (numbers only).
- **Database:** `evaluations/{uid}` (evaluation, signature, usedAi, generatedAt).
- **Limitations:** the fallback is saved with the same signature, so after an outage the learner keeps the numbers-only version until evidence changes or they press force (Assumption about UX; the `force` flag exists in the API).

### 2.17 Learning analytics / heatmap
- **Status:** Working. HIGH.
- **Frontend:** `app/(app)/classes/[classId]/heatmap/page.tsx`, `app/(app)/classes/heatmap/page.tsx` (cross-class).
- **Backend:** `GET /api/classes/{id}/heatmap` (`requireUser(["teacher","admin"])`, mutate access; reads enrollments, `users` (name, email, xp, streak), `mastery where classId`; statuses by `pL` thresholds .4/.7/`MASTERY_THRESHOLD`; per-KC mastered/struggling percentages). `POST /api/study/telemetry` (90/min) feeds `users.telemetryProfile` (cohorts, weak formulas/topics), `lib/learning/telemetry.ts`.
- **Limitations:** no AI; untried students show the topic prior (`bkt.pL0`) not "no data"; `streakDays || 1` invents a 1-day streak for missing values; student emails are returned to the teacher (expected but a privacy surface). `where("classId","==",id)` over all mastery docs is unbounded per class (scale risk, LOW).

### 2.18 Audio lessons and podcasts
- **Status:** Working, teacher-gated. HIGH.
- **Frontend:** `components/lesson/audio-lesson.tsx` (564 lines), topic page.
- **Backend:** `GET/POST /api/classes/{id}/kcs/{kcId}/audio` (teacher: generate, regenerate, extend, edit/remove a turn, `recordMissing`), `.../audio/{turn}` (clip by turn, language-aware, `translatedClip`/`prepareLanguage`). `lib/lesson/audio.ts`: `generateAudioLesson`/`extendAudioLesson` use `discussion_script`, `checkRateLimitAndQuota(4000/3000)`, `recordTurns` with `budgetMs 230000`.
- **Database:** `kcs/{kcId}/audio/meta` (turns, version, status) and clip docs `{id}` + `{id}_{k}` chunks holding `audioBase64` (PART_BYTES) INSIDE FIRESTORE; snapshots at `kcs/{kcId}/live/audio`.
- **Dependencies:** TTS chain (2.20).
- **Limitations:** audio stored base64 in Firestore (cost, 33% inflation, N reads per clip play; Firebase Storage is configured elsewhere, so this is a design choice, not a constraint). Class flag `audioLessons !== false` can disable. Push refuses unrecorded lines (good).

### 2.19 Notebook (lib/notebook)
- **Status:** Working. HIGH.
- **Frontend:** `app/(app)/notebook/page.tsx` (1,519 lines), `components/notebook/notebook-bar.tsx`; entry "Chat with your documents" in `components/shell/add-material.tsx`.
- **Backend:** `/api/notebooks*` (CRUD, sources, messages, share), `POST /api/notebook/chat` (client sends all sources in the body; zod has no max length on source `content`; `chunkText 500/80`; lexical `retrieveRelevantChunks` top 5; `checkRateLimitAndQuota(500)`; AI task `tutor_chat`), `/notebook/discussion` (`structured_spec`), `/notebook/artifacts` (`long_document` + `structured_spec`), `/notebook/voice`.
- **AI note:** the declared `notebook_chat`/`notebook_artifacts`/`source_guide` tasks are NOT used (Q5).
- **Limitations:** retrieval is keyword/overlap based (`tokenize`, stop words), no embeddings (`embedding` task unused). Whole source text re-uploaded on every chat turn. Citations are tag-based on retrieved chunks, so grounding quality depends on lexical overlap.

### 2.20 Text-to-speech (Edge, OpenRouter voice)
- **Status:** Working with an unofficial dependency. HIGH on code, UNKNOWN on production reliability.
- **Backend:** `POST /api/tts` (40/min, text<=1200, optional translate via `needsTranslation/translateOne`, `synthesizeSpeech`), `POST /api/tts/read` (60/min, text<=700, Sprout reading voice `en-US-AnaNeural` at `+45Hz` pitch via `synthesizeEdgeWithWords` giving word timings), `lib/ai/voice.ts`: order = Igbo/Hausa -> Gemini native; admin `openrouter-first` pref; Edge neural (`edge-tts-universal`, unofficial Microsoft Edge endpoint) with circuit breaker `edgeState`; second Edge voice; OpenRouter Kokoro-class voice; ElevenLabs (if key); Gemini TTS; else 503. `lib/ai/tts-cache.ts` caches podcast host lines (`host-voice.ts`) only.
- **Limitations:** no server cache for live reads (`Cache-Control: private, max-age=3600` only), so repeated "Listen" costs Edge/OpenRouter calls each time; no `checkRateLimitAndQuota` on TTS (OpenRouter voice spend is bounded only by the admin daily cap + per-minute limits); code comments admit Edge can be blocked from datacenter IPs. No browser `speechSynthesis` anywhere (grep clean), which is consistent and intentional.

### 2.21 Sprout reading assistant
- **Status:** Working. HIGH on implementation; MEDIUM on end-user smoothness (not run). See section 3 for the deep dive.
- **Frontend:** `components/lesson/read-through.tsx` (`useReadThrough`, `ReadPlayer`: queue via `lib/study/read-queue.ts`, play/pause/skip, rates `[1,1.25,1.5,.85]`, auto-next topic, `/api/tts/read` clips with word timings, fallback to `/api/tts`), `components/lesson/reading-follow.ts` (`followReading`: aligns spoken words to DOM words with `alignSpoken`, CSS Custom Highlight `sprout-word`/`sprout-line`, `LEAD_MS 190`), `lib/pet/read-hop.ts` (perch on word), `lib/voice/word-timing.ts` (`estimateWordTimings` fallback).
- **Limitations:** English-only Sprout voice (`/tts/read` has no translation; other languages use `/api/tts` with timing estimated); depends on `CSS.highlights`; relies on an `[data-dock]` convention to avoid fixed bars.

### 2.22 Simulation labs (lib/sim, components/labs, SimKit3D)
- **Status:** Working. HIGH for security design, MEDIUM for generation quality (unknown pass rate).
- **Frontend:** `components/labs/ai-simulation.tsx` (iframe `sandbox="allow-scripts allow-pointer-lock"`), `pieces-lab.tsx`, `interactive-studio-lab.tsx`, `prove-it.tsx`, `tap-to-enter.tsx`, `tutor-bubble.tsx`, preset labs `ohms-law-lab`, `rc-filter-lab`, `logic-gates-lab`, `projectile-lab`, `none-lab`.
- **Backend:** `/api/classes/{id}/kcs/{kcId}/simulation` (GET respects publication; POST teacher only, `checkRateLimit` 10/hour, 300s), `.../simulation/{undo,recommend,check}`, `.../pieces` (+`check`), `.../labs` and `.../labs/{labId}/start`, `POST /api/labs/verify`.
- **AI:** `sim_build` (`lib/sim/store.ts generateAndStoreSimulation`, `lib/sim/pieces.ts`), `structured_spec` for studio-mode (`lib/sim/studio-mode.ts`).
- **Database:** sim doc under the kc (html or `studioSpec`, version, status), pieces, `live/simulation` snapshot.
- **Security (positive):** `lib/sim/inject.ts` injects a strict CSP (`default-src 'none'; connect-src 'none'; form-action 'none'`) and a `postMessage` bridge (`window.sunroot.complete/progress/say/award`); only own iframe messages accepted. `public/sim/simkit3d.js` (222 lines) + `three.min.js` provide the 3D runtime (`lib/sim/runtime3d.ts`).
- **Limitations:** the `window.alert/confirm` shims auto-approve; model-written HTML can still burn CPU (no watchdog besides `runtime_error` events). Publication: P4.

### 2.23 Studio bench (circuits, Arduino, mechanisms, physics checker)
- **Status:** Working, the largest engineered subsystem in the slice (~8.9k lines under `lib/studio` + `components/studio`). HIGH on presence, MEDIUM on correctness (physics tests exist: `circuit.test.ts`, `physics.test.ts`, `gears.test.ts`, `cpp.test.ts`, `arduino.test.ts`).
- **Frontend:** `app/(app)/studio/**` (new, `[id]`, path, contests, wall, shop, debug), `components/studio/circuit-bench.tsx`, `mech-panel.tsx`, `viewer3d.tsx`, `sim-stage.tsx`, `guide-panel.tsx`, `topic-labs.tsx`, `part-shop.tsx`.
- **Backend:** `/api/studio/designs*` (create from template/prompt/blank, fork, commits, revert, collaborators, presence, star, wall, help, progress, `ai`), `/studio/{plan,ideas,research,paths,templates,parts,contests,wall,videos,debug}`.
- **Engines:** `lib/studio/circuit/{netlist,checker,runtime,stepper,catalog,to3d}.ts` (wiring/power checks with `Issue{severity,system,message,why,prompt}`, LED current limits, ULN2003/28BYJ-48 stepper model with datasheet numbers), `lib/studio/cpp.ts` (Arduino C++ beginner subset -> ES5), `lib/studio/mech/gears.ts`, `lib/studio/drive/*` (robot/machine physics), `lib/studio/verify.ts` (`verifyStep` runs on client for feedback AND on server as the trusted check: XP/contest scores from server checks only).
- **AI:** `studio_build` (`design-ai.ts`, `ai-build.ts`, `paths.ts`), `research_answer`, `notebook_mindmap`/`study_guide` (`lib/studio/generate.ts`), `tutor_chat` (design help).
- **Permissions/publishing:** class lab students cannot use AI build (`LAB_NO_AI_BUILD`); contest entries blocked while live (`CHALLENGE_LIVE`); design visibility private/public/class.
- **Limitations:** `studio_ai` plan limit never enforced (Q2). `POST /studio/designs/{id}/ai` rate-limited 8/min only. Public wall = user-generated content with no moderation hook found in `lib/studio/wall*.ts` (grep for moderate/report returned nothing; LOW-MEDIUM confidence, I did not read the wall route fully).

### 2.24 Blockly
- **Status:** Working inside Studio. HIGH on presence.
- **Where:** `components/studio/blockly-editor.tsx` (blockly ^13.4.0), `lib/studio/blockly/{arduino,convert,wired}.ts`, `lib/studio/blocks.ts`. Blocks convert to the same ES5 engine as JS and C++ (`cpp.ts`). Not available for class lessons outside Studio.

### 2.25 Three.js experiences
- **Status:** Working. `three` 0.186.1; `components/studio/viewer3d.tsx` (718 lines), `deferred-viewer3d.tsx` (lazy), `export-stl.ts` (tested), `components/teach/artifact3d-block.tsx`, `components/labs/interactive-studio-lab.tsx`, `lib/sim/studio-mode.ts`; inside AI sims, the sandbox loads `public/sim/three.min.js` + `simkit3d.js`.

### 2.26 Mermaid diagrams
- **Status:** UI illusion / dependency only. HIGH (negative search).
- **Evidence:** `mermaid` 12.2.0 is in `package.json`, but `grep -ril mermaid app components lib public` finds only `lib/teacher/representations.ts`, where a prompt string tells the model to "explain using a visual structural diagram (such as a fenced mermaid diagram...)". No `import("mermaid")` anywhere; `MarkdownRenderer` has no code-block component for it. A fenced mermaid block from the AI renders as a plain dark code block. This affects only the representation generator (2.32), which is itself a dead end, so the user-visible impact is currently nil but the dependency is dead weight.
- **Recommendation:** remove the dependency or build the renderer (client-only, `securityLevel:"strict"`).

### 2.27 Chemistry workbench / experiments (lib/experiments)
- **Status:** Working, small. HIGH.
- **Frontend:** `app/(app)/experiments`, `components/experiments/{lab,workbench-game,sim-canvas,saved-runs}.tsx`.
- **Backend:** `GET/POST/DELETE /api/experiments/runs` (checkRateLimit 20/min, max runs per user).
- **Content:** four hand-coded deterministic experiments in `lib/experiments/defs.ts` (projectile, pendulum, titration, gas) plus `workbench.ts` (561 lines) game rules. No AI.
- **Limitations:** saves runs to `experimentRuns` but never emits evidence/mastery (`grep evidence components/experiments` empty): practice here does not move mastery or recommendations. Not tied to topics/classes.

### 2.28 Engineering simulations
- Covered by 2.23 (circuit/mech/drive engines) and `lib/studio/twin/joints.ts`. Cross-reference only.

### 2.29 Quests
- **Per-topic quests (`lib/quest`, `components/quest/quest-runner.tsx`):** Working. Challenges (choose, number, slider-to-target, order, match) generated by `quest_build` as validated JSON (`lib/quest/schema.ts`, 196 lines); answers stay on the server (`toClientChallenge`); `quests/check` grades; `quests/complete` credits mastery once per quest version via `applyEvidenceIfEnrolled(activity:"lab")` (respects `LAB_RATE_LIMITED`); first-try ratio >= 0.6 counts as correct. Publication: P4/P5.
- **Seasonal/daily quests (`lib/quests/*`, `lib/game/quests`, `app/(app)/quests`):** Working but hard-coded: `SEASONS` constants through winter 2027-01-31 (today 2026-11-19 falls in "maker-month-2026"). Needs a code edit and deploy each season. Naming collision with per-topic quests is confusing.

### 2.30 Worlds
- **Status:** Partial. Rich, spec-driven feature (2,766 lines in `lib/worlds`, docs in `docs/worlds`), but see Q3.
- **Frontend:** `app/(app)/worlds` (new, `[worldId]` learn/node/review), `components/worlds/*` (`uploader`, `lesson-player`, `session-runner`, `ask-notes`, `class-worlds`).
- **Backend:** `/api/worlds` (create from uploaded notes or add to world, 10/min), `/worlds/advance` (job stepping, 120/min), `/worlds/docs*`, `/worlds/from-library`, `/worlds/{id}/{map,nodes,queue,progress,tutor,images,conflicts}`, `/worlds/report`.
- **AI:** its own stack: `generateStructured` with named prompts (`extract`, `ingest_vision`, `audit`, `tutor_chat`), config in `lib/ai/structured/config.ts`; requires an admin to "Set up from my existing keys" else `AI_NOT_READY` (503). Tutor answers are lexically retrieved, citations validated against retrieved ids (hallucinated citations dropped): good design.
- **Permissions:** owner-only worlds; class worlds require mutate access; `canPlay` for tutor.
- **Limitations:** no monthly quota, no `aiPaused`, no spend cap (Q3). Does not use `contentPublished`/lecturer gating (worlds are the uploader's own, or a class teacher's). Separate mastery model (`lib/worlds/memory.ts`, `grade.ts`) not linked to BKT (Assumption: I did not trace whether worlds progress writes to `mastery`).

### 2.31 Interactive challenges
- `app/(app)/challenges` + `app/api/events` + `lib/events` (scoring tested). Competitions with live/voting/ended states (`STATUS_STYLE`), Studio designs can be entries (`challengeId`). Social/competition rather than learning mastery; not deep-audited here.

### 2.32 Content-cache approval pipeline (`contentCache`)
- **Status:** Prototype / dead end. HIGH (negative search).
- **Frontend:** `app/(app)/classes/[classId]/manage/content/page.tsx`.
- **Backend:** `POST /api/classes/{id}/kcs/{kcId}/content/generate` (teacher; kinds explanation/worked_example/quiz/flashcards; representations from `lib/teacher/representations.ts`; AI `structured_spec` with no schema, so `JSON.parse(rawContentText)` fails on fenced JSON and falls back to `{text}`; `runPedagogicalQualityCheck`; saved as `status:"draft"` at `contentCache/{hash}`), `GET /classes/{id}/content`, `/content/{hash}` (approve).
- **Evidence it is a dead end:** `getApprovedCachedContent()` (lib/teacher/cache.ts) is defined but has zero callers; every `contentCache` read is under teacher-only routes. Approved content never reaches a student surface.
- **Impact:** a whole teacher workflow that spends AI tokens and presents "approval" but publishes nothing. Redundant with the lesson/practice publication model.

---

## 3. Sprout deep-dive

### 3.1 How it is implemented
- **Character:** one SVG, `components/bot/sprout.tsx` (`Sprout`), 13 poses (`idle|search|point|cheer|think|cross|dance|jump|wave|pull|giggle|flip|nap`), pose animation in CSS (`app/globals.css`), 5 moods (`sleepy|calm|happy|fired|genius`) that change palette only (`lib/pet/mood.ts PALETTES`). Equippable gear (hat/face/back/shoes) from the shop (`components/bot/sprout-gear.tsx`; `/api/pet` GET reads `shop.equipped` slots starting `pet_`).
- **Runtime:** `components/bot/bot-provider.tsx` (929 lines) mounted once in `app/(app)/layout.tsx` via `BotProvider`; renders Sprout through a React portal to `document.body`; exposes `useBot()` API (`hopTo, cheer, cheerAt, openAt, scanPage, flip, say, rest, path, stick, ...`). Modes `lively|calm|off` stored in `localStorage` key `sunroot:bot` and in Settings (`bot-toggle.tsx`). Motion helpers in `lib/pet/*` (`placement`, `read-hop`, `swing`, `motion`, `focus` for a 10-minute focus sprint timer, `calc-eval/calc-intent` for the overlay calculator). `jarvis-hud.tsx` is the tap menu (Scan, Explain, Quiz, Read aloud, Focus, Calculator, Ask tutor, Show off).
- **Persistence/state:** `GET /api/pet` computes mood from `users.streakDays`, `lastActiveDate` (days away) and mean `mastery.pL` of up to 30 topics (needs >=3); `POST /api/pet` renames (zod, 20/min). Name stored `users.petName`.
- **Voice:** reading voice `en-US-AnaNeural` +45Hz via `/api/tts/read`; the bubble text from `say()` is silent (only synthesized chimes `playCuteVoice` for cheer/search). There is no spoken Sprout line outside reading mode.

### 3.2 Where it appears
Global overlay on all `(app)` pages; plus inline `<Sprout/>` illustrations in the campus streak banner, profile setup, schools page, past-questions page, shop and pet page. Context-aware behaviours found by grep of `useBot`: class page (`classEncouragement` line after `rest()`), read page (hops to page corner, "Next page!" bubble, `cheerAt` progress bar at milestones, "You finished the whole class!"), `topic-done.tsx` (`cheer("Great recall!")`), `interactive-note.tsx` TermSheet (runs to a tapped word with a magnifier, ropes a pop-up up from below, jumps down onto it), `read-through.tsx` (perches on the word being read), `kinetic-formula.tsx` (scribbles over the crossed-out term), `bot-link.tsx` (runs to a tapped class card), tutor launcher (tap opens the tutor panel via `ASK_EVENT`).

### 3.3 Does it guide, react to mistakes, celebrate mastery?
| Capability | Verdict | Evidence |
|---|---|---|
| Orients on class entry with an honest data-driven line | Yes | `classEncouragement` in `lib/pet/encourage.ts` (uses avg mastery, mastered count, streak, `leftOff` topic) |
| Reacts to wrong answers | **No** | `components/quiz/quiz-player.tsx` has no `useBot`; wrong answers write `mistakes`/`misconceptions` but Sprout is silent. `grep useBot` shows no quiz, flashcard, past-question, lab or quest runner usage |
| Celebrates mastery | Partially | milestone cheers on the reader progress bar and `topic-done`; the quiz player celebrates with generic confetti, not Sprout; mood "genius" is passive colour |
| Mastery -> appearance | Yes, passive | `petMood`: genius needs avg mastery >= 0.8 and streak >= 3 |
| Guides next action | Weak | recommendation engine (`recommend-next`) is shown in the learning map, not voiced by Sprout; the HUD "Explain/Quiz" shortcuts send canned prompts to the AI tutor (`ASK_EVENT`) and fall back to a generic tip if the tutor is not mounted |
| TTS | Reading mode only | see 2.21 |
| Accessibility | Reasonable | `role="img"` + `aria-label` on the SVG, `aria-live="polite"` container, bubble `role="status"`, focusable button with label, `prefers-reduced-motion` handled (`reduced` flag skips choreography), Off mode. Gaps: bubble text auto-dismisses (timed `ms`) for screen-reader/slow readers; happy mood uses teal while the design system reserves brand blue and gold for reward; Sprout can overlap content on small screens (placement code `placement.ts`, `readDocks()` mitigate, not verified on device) |
| Native Android | Unknown | lives in a separate `sunroot-mobile` project |

### 3.4 Does it contribute to learning or is it decorative?
Honest assessment: the **reading companion** (word highlight, auto-scroll, perching, read-aloud) is a genuine learning aid (dual-coding, pacing). The **term lookup choreography** (running, rope, pop-up hauling) is delight with a real function underneath (glossary `explain_selection`), but it is slow by design ("slowly and clearly enough to follow", with `quick` mode after a few lookups) and is the most expensive animation in the product. **Mood and gear** are decorative-engagement. **Feedback on practice is absent**, which is exactly where a companion has the highest teaching value.

### 3.5 Making Sprout a consistent learning companion WITHOUT an expensive AI chatbot
All ingredients already exist as deterministic data; none requires a model call:
1. **Event bus, not chat.** Add a small `sproutReact(event)` map fired from the places that already compute the facts: quiz answer response (`correct`, `explanation`, `distractorMisconceptions` label), `applyEvidenceIfEnrolled` result (mastery crossing `MASTERY_THRESHOLD`), flashcard rating, `quests/complete`, `labs/verify`, `read/signal`. Return `{event, kcId, pL, delta}` in the existing JSON and let `bot.say`/`cheer` pick a line from a table.
2. **Template library, ~150 lines of copy**, keyed by (event, mastery band, streak band, attempt count), reusing `lib/pet/encourage.ts` style. Wrong answer + known `distractorMisconceptions` label -> "Many people pick that because ... try the explanation" using the stored explanation text; zero tokens.
3. **Next-best-action nudge from `recommend-next`** ("Strengthen X: you are at 38%"), spoken by Sprout after a topic or on class open, deep-linking via `bot-link`.
4. **Spaced-return hooks** from FSRS due counts and open mistakes (`/api/study/mistakes` counts, `flashcardStats`): "3 cards due, 2 mistakes to retest" as the day hello (`dayHello` already exists).
5. **Misconception pins:** when `misconceptions.resolved` flips true, `flip()` + the label ("You fixed: confusing mass and weight").
6. **Voice for free:** reuse `/api/tts/read` for a handful of fixed phrases and cache them in `tts-cache.ts`/CDN as static audio, giving Sprout a spoken praise/hint set at no marginal cost.
7. **Keep the AI tutor behind an explicit tap** (already true via `ASK_EVENT`); show Sprout's deterministic line first, "Ask the tutor" as the second action.
8. **Consistency:** make Sprout the single surface of feedback copy (replace ad-hoc toasts like "Sprout flagged this topic" in `past-questions/page.tsx` that currently name Sprout without Sprout acting), and always honour Calm/Off modes through `useBot().enabled`.
9. Guardrails: cap one line per 20 s, never interrupt an active quiz question (speak after answer reveal), and keep every line also in a toast/ARIA-live region for accessibility.

---

## 4. Strongest and weakest

**Strongest 5:** (1) Interactive reader + Sprout reading follow (2.5, 2.21): real differentiator, deep word-level sync. (2) Studio bench and circuit/Arduino checker engines (2.23): deterministic, datasheet-based, server-verified steps. (3) Quiz bank architecture (2.9): AI once per topic, zero AI per attempt, server-held answers, adaptive focus. (4) Student evaluation (2.16): hash-skip caching plus a numeric fallback is the model other features should copy. (5) Sandboxed AI simulations (2.22): strict CSP + bridge, publication-aware.

**Weakest 5:** (1) Past-question AI solver (2.10): no `schema`, always 502 on cache miss, masked by a mocked test, on the paid feature. (2) `contentCache` approval pipeline (2.32): spends tokens, approves nothing students can see. (3) Publication gating for AI-built topics (P1/P2): the lecturer-control story is not true for the main creation path. (4) Worlds quota bypass (Q3): a full AI pipeline outside budgets/kill switch. (5) Mermaid (2.26) and unenforced plan limits `studio_ai`/`class_build` (Q2): advertised or imported, not delivered.

**Confusing / redundant:** two ways to structure a class (class_build vs `syllabus/generate`) plus a third (`proposals/apply`); two "content generators" (lesson + banks vs `contentCache`); two meanings of "quests"; three memory models (FSRS, BKT, mistake counter); two AI stacks (`generateWithFallback` vs `lib/ai/structured`); `flashcards` as bank vs personal decks vs notebook decks; "Teach" interactive lessons (`/api/teach`) vs lesson notes vs textbook reader vs flipbook notes (four ways to read the same content); 12 unused AI task ids in the admin model-routing UI.

---

## 5. Trace: student opens a class -> topic -> requests AI notes

There are two different things a student can call "AI notes". Both traced; neither goes through `aiCache`.

### 5A. Class lecture notes (what a student actually gets)
1. **Open class:** `app/(app)/classes/[classId]/page.tsx` loads `GET /api/classes/{id}` (`app/api/classes/[id]/route.ts`): `requireUser`, `assertClassAccess`, kcs ordered by `order`; for students it filters `status !== "draft" && !== "archived"`, strips `contentPublished`/`liveLessonMarkdown`, sets `lessonMarkdown = lessonForStudents(kc)` and a `published` map (`publishMapOf`); batched `mastery/{uid}_{kcId}` read; translation to the learner language (`classSourceLanguage`, `localizeFor`).
2. **Open topic:** `topics/[kcId]/page.tsx` -> `GET /api/classes/{id}?kc={kcId}` (full note translated only for this topic) and `POST /kcs/{kcId}/profile`.
3. **Press "write the lesson":** the page's `generateLesson()` calls `POST /api/classes/{id}/kcs/{kcId}/lesson`.
   - Auth: `requireUser(req)`.
   - Access: `assertClassAccess(caller, classId, "view")`.
   - Validation: zod `bodySchema` (`regenerate`, `instructions<=1500`) via `parseJson`.
   - **Break point for students:** `if (!access.canMutate)` returns 403 "Only the teacher writes lessons". The student never reaches the AI. The UI only auto-calls it when `canManage && lessonIsThin`.
4. **Teacher path (the real generation), for completeness:** `generateLessonForKc()` (`lib/lesson/generate.ts`) -> Firestore transaction lock `lessonGeneratingAt` (3 min) -> `checkRateLimitAndQuota(userId, 14000)` (`lib/quota/guard.ts`: shared per-minute counter + monthly budget incl. outstanding reservations) -> `loadKcGroundingContext(materialBudget 24000)` (`lib/kc/context.ts`) -> `placeInTree` + `textbookSystemPrompt` -> **`generateWithFallback({task:"lesson_notes", learnerLanguage:false, maxOutputTokens:16000, estimatedTokens:14000})`** in `lib/ai/router.ts` (aiPaused check, `reserveQuota`, no `cacheKey`, provider chain openrouter/groq/gemini, `settleQuota`) -> reject if <1200 chars -> **save** `kcRef.update({lessonMarkdown, lessonStyle, lessonNumber, lessonGeneratedAt, lessonGeneratingAt:null, contentVersion+1})` -> route `after()` prepares quiz and flashcard banks.
5. **Publication:** the note is a draft until `POST /kcs/{kcId}/publish` -> `pushToStudents` writes `liveLessonMarkdown` (except P1 topics, where `follow` mode shows the working copy at once).
6. **Student reads:** step 1/2 read path (`lessonForStudents`), rendered by `MarkdownRenderer` (KaTeX) or the reader.
7. **Quota:** teacher's token budget (uncapped for teachers until billing is enforced, `budgetOf`) pays; the student pays nothing. `checkFeature` is NOT called on this path (the `lessons` plan feature belongs to `/api/teach`, not this).

### 5B. Student's own AI notes (`/study/notes`)
UI `app/(app)/study/notes/page.tsx` -> `POST /api/study/notes`: `requireUser` -> `checkRateLimit(6/min, keyPrefix study_notes)` -> zod `createSchema` (text 40..1,000,000) -> cap 60 sets -> `checkFeature(uid,"notes")` (plan allowance, only if billing enforced; free = 3/month) -> `checkRateLimitAndQuota(uid, 9000)` -> **`generateWithFallback({task:"study_guide", userId})`** with learner audience prompt, learner language and (since no `cacheKey`/privileged) Learner DNA injection -> length check -> save `studyNotes/{id}` + version 1 (`addVersion`) -> `recordFeature(uid,"notes")`. Reads: `GET /api/study/notes/{id}`.
- Cache: none for identical inputs; the saved note is the only persistence.
- Break points: the 1 MiB Firestore doc limit with `sourceText` (MEDIUM), no dedupe.

---

## Open questions

1. **Is the past-question solver really failing in production?** Why it matters: it is the paid Exam Pass feature; reading shows a guaranteed 502 on any cache miss. Who can answer: the owner / whoever runs production logs (search for `AI_GENERATION_FAILED` on `/api/classes/*/past-questions`). Evidence: a production call with an uncached question, or Vercel log counts.
2. **Which classes were AI-built and already published (P1)?** Why: those topics are in `follow` mode, so regenerations reach students instantly. Who: owner with Firestore access. Evidence: count of `kcs` docs with `source:"ai_topic"` and no `contentPublished`.
3. **Does anything auto-resume `waiting_quota` class builds?** Why: otherwise teachers must press resume. Who: owner; evidence: `vercel.json`/scheduled job list and `app/api/jobs/*` (I did not trace them).
4. **Does Worlds write to `mastery`/BKT, and is its AI spend monitored anywhere else (OpenRouter dashboard)?** Why: Q3 bypasses budgets. Who: owner/admin. Evidence: `lib/worlds/play.ts`/`grade.ts` writes and the admin spend page.
5. **Do production deployments have a Gemini key set?** Why: `generateStructuredJson` throws without one, which would break syllabus generate, diagnostic start and the map daily note when only Groq/OpenRouter is configured. Who: owner/admin. Evidence: admin AI key page / env.
6. **Real-world reliability of Edge TTS from Vercel IPs.** Why: Sprout's reading voice and the podcast depend on an unofficial endpoint; code already contains a circuit breaker. Who: owner; evidence: `/api/tts/read` 503 rate in logs.
7. **Quality of generated quiz/answer correctness (bank "verified" claim).** Why: wrong answer keys damage trust and mastery. Who: product/QA lead; evidence: a sampled human review of 50 bank questions, or a verifier pass.
8. **Is there moderation on the Studio public wall and contest entries?** Why: user-generated content. Who: owner; evidence: read `app/api/studio/wall*` and `lib/studio/wall-server.ts` fully (I only grepped).
9. **Android parity:** does `sunroot-mobile` implement Sprout, TTS reading and the publication model? Why: this audit covers only the web repo. Who: mobile owner; evidence: that repo.
10. **Is the mermaid dependency or the `contentCache` pipeline planned work?** Why: decide build vs delete. Who: product owner; evidence: roadmap docs (`docs/PROGRESS.md`, `ANTIGRAVITY_CRITICAL_FIXES_AND_ROADMAP.md` were not read in this pass).


---

# PART 2 - Social, institutional and commercial features, and the lecturer and student journeys

# Feature Inventory, Part 2: Social, Institutional, Commercial, plus Lecturer and Student journeys

Repo: shamzrepha/synapta (product SunRootLearn / "Sunroot"). Branch audited: worktree of `main` at commit `e3eb258`.
Method: static reading only (git grep, cat, wc). No builds, no tests run, no network calls, no AI calls. Nothing was executed against Firestore or production, so every "Verified" below means "verified by reading the code path", not "observed running". Where I could not read a UI component in full I say so.

Status vocabulary: Production / Working / Partial / Prototype / UI only / Planned / Broken / Unknown.
Confidence: HIGH / MEDIUM / LOW / UNKNOWN.

Note on `lib/features/registry.ts`: the in-app "Everything" page (`app/(app)/more/page.tsx`) shows "45 of 45 are live" because every registry entry has `status: "live"`. That is a self-declared label, not evidence. Nothing in this document relies on it.

---

## 0. Headline findings (read this first)

| # | Finding | Status | Confidence |
|---|---------|--------|-----------|
| H1 | Any signed-in user can make themselves a teacher with no admin approval, via the school portal (`POST /api/schools` `create_school` then `register_members` with `role: "teacher"` and their own username). | Verified by code reading | HIGH |
| H2 | `BILLING_ENFORCED` unset (the documented default) means: per-feature plan limits never block anyone, but a flat 50,000-token monthly cap and 10 calls/min still apply to students, teachers are uncapped, and the Plans page displays a different token number (100,000) than the one enforced. | Verified | HIGH |
| H3 | Three of the six metered features (`class_build`, `studio_ai`, and partly `lessons` for class topics) are advertised in plans but have no `checkFeature` call. The Teacher plan's "25 AI class builds a month" and the trial's "2 builds" are dead configuration even after enforcement is switched on. | Verified | HIGH |
| H4 | `POST /api/lounge/match` has no class-access check and returns every active enrollee's email, XP and mastery for any classId. `GET /api/lounge/rooms` lists the 20 most recent study rooms across all classes, and `GET /api/lounge/rooms/[roomCode]` auto-joins any caller who knows the code. | Verified | HIGH |
| H5 | AI-generated content can reach students without per-item human review: "Publish Class" and "Publish all content" push every draft (the UI confirm dialog says so), and the student-triggered interactive lesson (`POST /api/teach`) generates, stores and serves an AI script to all students on first open, outside the publish snapshot. | Verified | HIGH |
| H6 | The "Content Review" page (approve/reject AI drafts, toast says "now live and served to all enrolled students") is a UI illusion: nothing reads `contentCache` approval status for students (`getApprovedCachedContent` has zero callers). | Verified | HIGH |
| H7 | Teachers cannot see class-wide misconceptions. Misconceptions are recorded per learner and shown only to that learner. The heatmap shows only BKT mastery. | Verified | HIGH |
| H8 | "Assign practice" is a read-only AI-written worksheet. No due date, no student submission, no score, no tracking. | Verified | HIGH |
| H9 | Two parallel DM systems (`/friends` uses `direct_chats`, `/messages` uses `chats`). A message sent in one is invisible in the other. | Verified | HIGH |
| H10 | APK files `public/sunroot-3.2.apk` and `public/sunroot-3.3.apk` (about 8.9 MB each) are tracked in git, which `CLAUDE.md` forbids. | Verified | HIGH |

---

# PART A. SOCIAL AND ENGAGEMENT

Common facts for every social route: all use `requireUser(req)`; rate limiting is per-route via `checkRateLimit`; real-time is done with "signal" documents (`liveChannels/{channel}`, `userSignals/{uid}`) that the client watches with Firestore `onSnapshot` and then refetches through the API (`lib/live/server.ts`, `lib/live/client.ts`). Firestore rules deny all client writes on `users`, `classes`, `enrollments`, notifications (`firestore.rules`). There is no content-report or abuse-report flow for the social surfaces (searched `report` under `app/api/feed|lounge|chats|messages|communities`: no hits). Moderation exists only as owner/admin delete.

### A1. Communities ("School communities")
- **Status:** Working (core), Partial (moderation and discovery).
- **Frontend:** `app/(app)/communities/page.tsx`, `app/(app)/communities/[id]/page.tsx`. Not listed in the Community hub start tiles (`app/(app)/community/page.tsx` lists Feed, Messages, Friends, Challenges, Leaderboard, Study sessions, Peer lounge). Reachable via the Everything page and nav `match` only.
- **Backend:** `app/api/communities/route.ts` (list mine plus 20 open; create, 5/hour, requires verified email), `communities/join`, `communities/[id]`, `[id]/members`, `[id]/posts`, `[id]/posts/[postId]` (+ comments, like). Pure rules in `lib/communities/rules.ts` (kinds school/campus/club, roles owner/member, 6-char join codes) with unit tests.
- **Database:** `communities`, `users/{uid}/communities`, posts subcollection.
- **AI:** none.
- **Dependencies:** email verification (`requireVerifiedEmail`).
- **Permissions:** owner can manage and delete posts; members post; open vs code join.
- **Publishing:** n/a.
- **Limitations:** only two roles (no moderators); no report button; discovery shows only the 20 newest open communities (`orderBy createdAtMs desc limit 40`, then filtered); not linked to schools (`schoolId`) despite the name "School communities".
- **Evidence:** files above; `lib/communities/rules.test.ts`.

### A2. Feed (global, class, following, hashtag, user)
- **Status:** Working.
- **Frontend:** `app/(app)/feed/page.tsx`, `components/feed/post-card.tsx`, `components/feed/social-input.tsx`.
- **Backend:** `app/api/feed/route.ts` (scopes global/class/following/tag/user, cursor pagination of 20), `feed/[postId]` (+ like, react, repost, bookmark, vote, comments, comment like), `lib/social/feed.ts`, `reactions.ts`, `follow.ts`. Class scope calls `assertClassAccess(view)`. Posting calls `trackProgress` (XP) and reads `planOf` (plan-based posting limits).
- **Database:** `posts`, comments subcollection, follows, bookmarks.
- **AI:** none found in the feed route.
- **Permissions:** class owner or admin can moderate class posts (`canModerate` in `feed/page.tsx`).
- **Limitations:** the global scope is a single public timeline; no report/mute/block; moderation only by deleting.
- **Evidence:** `app/api/feed/route.ts`, `app/(app)/feed/page.tsx` line using `canModerate`.

### A3. Friends and Follow
- **Status:** Working.
- **Frontend:** `app/(app)/friends/page.tsx`, `app/(app)/u/*` (public profile).
- **Backend:** `app/api/friends/route.ts`, `friends/request`, `friends/[friendUid]`, `users/[userId]/follow`, `users/[userId]/profile`, `users/search`, `mentions/users`.
- **Database:** `users/{uid}/friends/{friendUid}`, follow collections.
- **Limitations:** two relationship models (friends and follow) both exist.

### A4. Messaging / DMs (two systems)
- **Status:** Working but duplicated (Partial from a product view).
- **Frontend:** `app/(app)/messages/page.tsx` (new system) and the chat panel inside `app/(app)/friends/page.tsx` (legacy).
- **Backend:** NEW `app/api/chats/**` (7 routes: list/create direct and group chats, members, messages, read receipts, typing, reactions) with `lib/chat/store.ts` (group max 50, six emoji reactions, push via `sendPush`, attachments restricted to internal `/…` links). LEGACY `app/api/messages/[friendUid]/route.ts` (friends only, 2000-char text, stored in `direct_chats/{a_b}/messages`).
- **Database:** `chats/{dm_a_b}` plus messages; `direct_chats/{a_b}/messages`.
- **Evidence for the split:** `git grep "api/messages"` hits only `friends/page.tsx`; `git grep "api/chats"` hits only `messages/page.tsx`. A DM opened from Friends is therefore not in the Messages inbox, and vice versa.
- **Recommendation:** migrate the friends chat panel to `/api/chats` (`directChatId`) and retire `direct_chats`.
- **Confidence:** HIGH.

### A5. Study rooms / Peer lounge
- **Status:** Partial (works, but access control is weak).
- **Frontend:** `app/(app)/lounge/page.tsx`, `lounge/[roomCode]/page.tsx`.
- **Backend:** `app/api/lounge/match/route.ts`, `lounge/rooms/route.ts` (list and create), `lounge/rooms/[roomCode]/route.ts` (read, auto-join), `messages`, `scratchpad`, `design`, `credit`.
- **Database:** `rooms/{SYN-XXXX}` with `memberIds`, `participants`, `messages` and `credits` subcollections.
- **AI:** none; `credit` applies BKT evidence via `lib/evidence/apply.ts` (`applyEvidenceIfEnrolled`, activity `peer_explain`, +40 XP, Omega 2.0).
- **Dependencies:** BKT engine, evidence pipeline.
- **Limitations and defects (all verified in code):**
  1. `match` has no `assertClassAccess` and no rate limit. It returns, for every active enrollee of any classId, `email`, `xp`, `streakDays` and the topic mastery `pL`. This is a PII and roster leak to any signed-in user who knows or guesses a class id.
  2. `GET /api/lounge/rooms` lists the 20 most recently updated rooms across every class (title, classId, host name) with no membership or class filter.
  3. `GET /api/lounge/rooms/[roomCode]` adds the caller to `memberIds` on a plain GET if they are not yet a member. The 4-character code (`SYN-` plus 4 chars from a 32-letter alphabet, generated with `Math.random`) is about 1 million combinations, and rooms are listable anyway, so "private" rooms are not private.
  4. `POST rooms` accepts `invitedUids` and makes them members without consent, and does not verify the caller can see the class.
  5. `credit` is limited to one credit per pair per room, but a new room can be created freely (no rate limit on room creation), so two cooperating accounts can mint repeated `peer_explain` evidence plus 40 XP and mastery acceleration. Partially verified: depends on `applyEvidenceIfEnrolled` caps, which I did not read.
- **Evidence:** the four route files above.
- **Confidence:** HIGH on 1 to 4, MEDIUM on 5.

### A6. Focus sprints (Pomodoro rooms)
- **Status:** Working. Best-built social feature in the slice.
- **Frontend:** `app/(app)/focus/page.tsx`, `focus/[code]/page.tsx`, `focus/stats/page.tsx`.
- **Backend:** `app/api/focus/rooms/**` (create 6/min, join, complete), `focus/stats`; `lib/focus/timer.ts` (+ test) computes synced phase from a shared `anchorMs`; `lib/focus/server.ts` (max 30 members, presence window `PRESENCE_MS`, code uniqueness loop).
- **Database:** `focusRooms/{code}`, member and session docs.
- **Presence:** per-room heartbeat only. There is no global "who is online" presence anywhere (grep for presence/heartbeat finds focus, lounge, studio, and `auth/bootstrap`).
- **Limitations:** none material; streak credit for focus uses `lib/streaks/days.ts` (a third streak library, see A9).

### A7. Study groups
- **Status:** Working.
- **Frontend:** `app/(app)/groups/page.tsx`, `groups/[id]/page.tsx`.
- **Backend:** `app/api/groups/route.ts`, `groups/join`, `groups/[id]`; `lib/groups/*` (group streak via `loadGroupStreak`, `MAX_GROUPS_PER_USER`, invite codes).
- **Database:** `studyGroups` (`memberUids`).
- **Limitations:** overlaps with Communities (A1) and Lounge rooms (A5) and the Community hub tiles. Three "groups of people" concepts with different join mechanics.

### A8. XP, levels, badges
- **Status:** Working.
- **Backend:** `lib/game/progress.ts` (`trackProgress` central event handler), `lib/game/levels.ts`, `badges.ts`, `quests.ts`; `app/api/me/game/route.ts`.
- **Database:** `users.xp`, `users.xpSpent`, stats, badges on the user doc.
- **Limitations:** referral XP is written straight to `users.xp` (`app/api/referrals/route.ts`) and bypasses `trackProgress`, so it skips badges, league and quest hooks.

### A9. Streaks and freezes
- **Status:** Working, over-engineered.
- **Frontend:** `app/(app)/streak/page.tsx`.
- **Backend:** `app/api/streak/route.ts`, `lib/streak/logic.ts` + `server.ts` (calendar, frozen-day inference, recovery), `lib/game/streak.ts` (`MAX_STREAK_FREEZES`), `lib/streaks/days.ts`, `app/api/jobs/streak-reminders/route.ts` (daily cron 18:00 UTC in `vercel.json`).
- **Freezes:** earned by streak length (`daysToNextFreeze`) or bought in the shop (kind `freeze`); "recovery" of a broken streak costs XP (`recoveryCost`).
- **Limitations:** three streak modules (`lib/game/streak.ts`, `lib/streak/`, `lib/streaks/`) with overlapping responsibilities. The streak route reads freezes from `u.streakFreezes` while also calling `touchUserStreak`, so the displayed `freezes` can lag one request (minor, not traced fully).
- **Confidence:** MEDIUM on the lag, HIGH on duplication.

### A10. Leagues and leaderboards
- **Status:** Partial (works for active users; settlement is lazy).
- **Frontend:** `app/(app)/leaderboard/page.tsx`.
- **Backend:** `app/api/leaderboard/route.ts` and `leaderboard/weekly`; `lib/game/leagues.ts` (10 tiers Bronze to Diamond, cohorts of 30, promote 7, demote 5, no demotion in cohorts under 15); `lib/game/progress.ts` `addLeagueXp` and `settleLeagueWeek`; `lib/weekly/server.ts`.
- **Database:** `leagueEntries/{weekId_uid}`, `leagueCohorts`, `users.leagueTier`, `leagueLastWeek`.
- **Privacy:** users can opt out (`showOnLeaderboard`).
- **Limitation (verified):** promotion and demotion are settled lazily, per user, the next time that user earns XP (`settleLeagueWeek` called from `addLeagueXp`). There is no weekly cron for leagues in `vercel.json` (only streak reminders and goal reminders). A learner who stops studying is never promoted or demoted and keeps a stale tier; the cohort a dormant user occupied is never "closed". `jobs/session-reminders` exists but is not scheduled on Vercel.
- **Cohorts are not school-scoped:** league cohorts fill in arrival order, so classmates are not grouped.

### A11. Challenges / Events
- **Status:** Working. Teacher-hosted only.
- **Frontend:** `app/(app)/challenges/page.tsx`, `challenges/[eventId]/page.tsx`; `components/events/*`.
- **Backend:** `app/api/events/**` (9 routes: create, join, answer, next, submit, submit-design, vote, finalize); `lib/events/scoring.ts` (+ test), `lib/events/store.ts`.
- **Kinds:** `quiz_sprint`, `hackathon`, `build`.
- **AI:** sprints can generate a fresh question set (`executeStructuredAiTask`, `ensureQuizBank`); capped at 5/min and 12/day per teacher (shared limit).
- **Permissions:** create requires `requireUser(req, ["teacher","admin"])`, so students cannot host. Class-scoped events need `assertClassAccess(mutate)`.
- **Limitation:** the nav tile says "Quick duels", but there are no peer-to-peer duels; only teacher-hosted events exist. Winners get an achievement share (`shareAchievement`).

### A12. XP shop, wardrobe, rewards
- **Status:** Working, with a UI illusion (themes).
- **Frontend:** `app/(app)/shop/page.tsx`, `app/(app)/pet/page.tsx`; `components/shop/theme-applier.tsx`.
- **Backend:** `app/api/shop` (state), `shop/purchase` (20/min), `shop/equip`; `lib/shop/catalog.ts` (28 items: themes, frames, titles, freezes, recovery, Sprout accessories in 4 slots), `lib/shop/server.ts`; `app/api/pet/route.ts` and `lib/pet/*` (544 lines).
- **Database:** `users.shopOwned`, `shopEquipped`, `xpSpent`, `users/{uid}/shopLedger`.
- **Illusion (verified):** accent themes work by overriding `--color-teal-*` CSS variables (`theme-applier.tsx`). The design system moved the action colour to `brand-*` (about 1,187 uses) and teal is now the success colour (about 87 uses; `app/globals.css` header comment). A purchased "Ocean/Sunset" theme therefore recolours mostly success states, not buttons and links. Users pay XP for a change that is barely visible. Partially verified: I did not render the app.
- **Recommendation:** point themes at `--color-brand-*` or remove them.

### A13. Polls
- **Status:** Working. `app/(app)/polls/page.tsx`, `app/api/polls/**` (create, vote, comments, share), `lib/polls/logic.ts` (+ test). Rate limited, `requireUser`.

### A14. Mentors and peer tutors
- **Status:** Working (mechanics); Unknown (supply and adoption).
- **Frontend:** `app/(app)/mentors/page.tsx`, `app/(app)/tutors/page.tsx`, `app/(app)/ask/*` (anonymous ask).
- **Backend:** `app/api/mentors/{profile,matches,requests,requests/[id],requests/[id]/checkins}`, `lib/mentors/matching.ts` (+ test). `app/api/tutors/requests/**` (answer, rate), `lib/tutors/rules.ts` (+ test). `app/api/ask/**`.
- **Limitation:** matching quality needs a critical mass of mentors per subject. Nothing in code seeds or measures supply. Cannot verify from code that any mentor exists.

### A15. Shout-outs
- **Status:** Working. `app/(app)/shoutouts/page.tsx`, `app/api/shoutouts/route.ts` (81 lines), `lib/shoutouts/rules.ts` (+ test), `components/shoutouts/shoutouts-hub.tsx`, strip on the dashboard.

### A16. Notifications and push
- **Status:** Working in-app; Partial for push (environment dependent).
- **Frontend:** `app/(app)/notifications/page.tsx`, `components/notifications/push-toggle.tsx`, `public/firebase-messaging-sw.js`.
- **Backend:** `app/api/notifications` + `read`, `lib/notifications/server.ts` (`notify`, `notifyMany`), `lib/notifications/push.ts` (`sendPush` via FCM `sendEachForMulticast`, max 10 tokens per user, dead tokens pruned, data-only messages), `app/api/me/push-token/route.ts`, `lib/push/config-check.ts` (+ tests).
- **Database:** `users/{uid}/notifications`, `users/{uid}/pushTokens` (token hash as doc id).
- **Dependencies:** six Firebase web env values including the VAPID key; the repo ships a config checker because misconfiguration has been a repeat problem.
- **Limitation:** web push only. The Android app lives in a separate repo (`sunroot-mobile`), not auditable here. Admin approval of a teacher request sends no notification (`app/api/admin/users/[uid]/route.ts` has no notify call), so a lecturer waits without feedback.

### A17. Referrals
- **Status:** Working, gameable.
- **Frontend:** reads and writes from `components/profile/profile-setup.tsx` (pending ref stored in `localStorage` key `sunroot:pending_ref`) and the profile page. No dedicated page.
- **Backend:** `app/api/referrals/route.ts`. Referral code is simply the referrer's `username`. A claim gives +250 XP to both; the referrer's 10th referral grants a 14-day Exam Pass (`plan: "exam"`) if on free or exam.
- **Controls:** verified email required, 5 claims/min, one claim per account, transactional double-claim protection.
- **Weaknesses:** a verified email is cheap (aliases, throwaway inboxes); the code is a public username; a claim can be made at any time, not just at sign-up; XP is written directly to `users.xp`, bypassing `trackProgress`. A user with 10 throwaway verified accounts gets a free Exam Pass. Cost to Sunroot: limited (14 days of a low plan), but the 250 XP buys shop items.

### A18. Presence
- **Status:** Partial. Per-room only (see A6). No global online/last-seen indicator was found.

### A19. Other social items seen
- **Explainers** (`app/(app)/explainers`, `app/api/explainers`): student-made 60-second videos. Status Unknown beyond the routes (3 routes, 169 lines); I did not trace video storage.
- **Quests** (`app/(app)/quests`, `app/api/quests`, `lib/quests`): seasonal quests with a claim route. Working.
- **Goals** (`app/(app)/goals`, `app/api/goals`, daily cron 07:00 UTC): goal tracker with reminders. Working.
- **Study sessions** (`app/(app)/sessions`, `app/api/sessions`): RSVP sessions; reminders are sent "lazily when sessions are viewed" (`app/api/jobs/session-reminders/route.ts` header), not by a scheduled job on Vercel.

---

# PART B. INSTITUTIONAL

### B1. Teacher accounts and role requests
- **Status:** Working, with a bypass (see H1).
- **Frontend:** the sign-up page (`app/(auth)/signup/page.tsx`) has a Student/Teacher toggle (`requestTeacher`); `app/(app)/profile/page.tsx` has a "request teacher" control (pending/approved states).
- **Backend:** `POST /api/me/request-teacher` marks `roleRequest: "pending"`, or auto-approves if the email is in `ADMIN_EMAILS` and verified; admin approves via `app/api/admin/users/[uid]/route.ts` (role, roleRequest, token limit). On approval `role` is set in Firestore; `requireUser` re-reads Firestore on every call, so the role is effective immediately.
- **Database:** `users.role`, `users.roleRequest`, custom claim.
- **Permissions:** teacher routes use `requireUser(req, ["teacher","admin"])`.
- **Limitations:** no applicant verification (no institution, staff ID or document), only an admin eyeballing a list; no notification on approval or rejection; a pending teacher still sees a student UI.
- **The bypass (H1), traced:**
  1. `POST /api/schools` `create_school` is open to any signed-in user (3 per hour). It sets the caller as `principalUid` and puts them in `teacherUids`.
  2. `register_members` with `role: "teacher"` passes `canAssignTeachers` for the principal.
  3. The lookup is by `username` or `email`, and the principal's own account matches. `membershipFor` returns `already_here` for them, which is not skipped (only `other_school` or an admin is skipped), so `updates.role = "teacher"` is written to their user document.
  4. Result: self-promotion to teacher, plus the ability to promote up to 100 accounts per request, with no admin approval. Side effects: `sponsorshipPatch` also grants the principal the School plan for the 14-day pilot.
  5. Reading `requireUser` confirms the Firestore role overrides the token claim, so this is effective.
- **Confidence:** HIGH (code path read end to end; not executed).
- **Recommendation:** require platform-admin (or a verified-institution flag) for `register_members` with `role: "teacher"`; require admin approval of new schools before they can mint teachers.

### B2. School administration and Principal portal
- **Status:** Partial.
- **Frontend:** `app/(app)/schools/page.tsx`. Reachable only from the Everything page, a link on Challenges and a link on Plans (`git grep '"/schools"'`); not in the main nav.
- **Backend:** one route, `app/api/schools/route.ts` (609 lines): GET modes `directory` (public, rate limited), `standings`, default (own school and roster); POST actions `create_school`, `public_register_school` (unauthenticated, 3/hour/IP), `register_members` (by @username or email, 100 at a time), `join_by_code`, `admin_grant_seats`, `school_announce` (5 per 10 min). Pure rules in `lib/schools/policy.ts` (+ test). Standings in `lib/schools/standings.ts` (+ test).
- **Database:** `schools`, `institutionInquiries`, `users.schoolId`, `users.institution`.
- **Seat model:** `seatLimit`, `studentCount`, `seatExpiresAt`; pilot = 14 days; `admin_grant_seats` extends (default 135 days) and updates the first 450 members' sponsorship.
- **Findings:**
  - `public_register_school` creates a school with `principalUid: ""`. Nobody except an admin can manage it, yet the invite code is returned to the anonymous caller, who can distribute it. Students can join and be sponsored for 14 days with no human principal. Orphan schools accumulate.
  - There is no leave, remove or move action. `studentCount` is incremented on join and never decremented, so seats are consumed permanently; the error text "Ask your school administrator to move you" refers to a function that does not exist.
  - `join_by_code` increments `studentCount` for any joiner including teachers; `register_members` counts only new students. Seat accounting is inconsistent.
  - `register_members` does not check licence expiry; `join_by_code` does.
  - The "principal dashboard" values are partly invented defaults: if a student has no `telemetryProfile`, `predictedReadiness` defaults to 65, `weeklyGain` to 6, `level` to "100L", and school `avgReadiness` to 68 when no members. `atRisk` is `readiness < 55`, so a student with no data is never "at risk" and every empty school looks healthy. This is a UI illusion for a paying audience.
  - Principal and teacher see every member's email (`isManager`), including students' (privacy and consent to confirm with the product owner).
  - Student read access: students see totals only, not the roster. Good.
  - `register_members` is skipped for admins and cross-school accounts. Good.
- **Limitations:** invoice-based seats (no Paystack for schools); no per-class linkage between a school and its classes (classes carry free-text `institution`, not `schoolId`), so a principal cannot see "all classes in my school" nor class analytics.
- **Evidence:** `app/api/schools/route.ts`, `lib/schools/policy.ts`, `app/(app)/schools/page.tsx`.

### B3. One-school-per-student rule
- **Status:** Verified, working in the three entry paths.
- **Evidence:** `membershipFor` in `lib/schools/policy.ts`; enforced in `create_school`, `join_by_code` (inside a transaction with the seat check), and `register_members`. The rule is a convention on `users.schoolId`: nothing at the Firestore-rules level (writes are denied to clients anyway) and no leave or transfer path (see B2).

### B4. Class management (create, edit, ownership, co-teachers)
- **Status:** Working.
- **Frontend:** `app/(app)/classes/manage/page.tsx` (list; teachers get "Create a class" which links to `/explore?create=1`, so class creation lives inside the discovery page), `app/(app)/classes/[classId]/page.tsx` (970 lines: student and teacher views combined), `classes/[classId]/manage/page.tsx` (join code, pending requests, roster), `components/classes/edit-details.tsx`.
- **Backend:** `app/api/classes/route.ts` (create/list), `classes/[id]/route.ts` (read/update/delete), `roster`, `requests/[uid]`, `access`, `join`, `announcements`.
- **Ownership model (`lib/auth/classAccess.ts`):** `teacherId` plus `coTeacherIds` are both "owner" with full mutate rights; admin can view and mutate every class; owners cannot enroll in their own class. An admin can add themselves as co-teacher via `join` with `as: "teacher"`. No API for a teacher to add a co-teacher (only the admin self-join path was found), and no ownership transfer.
- **Defaults to note:** a class is created `status: "published"`, `visibility: "public"` unless the wizard sends `drafting`; so an empty class is publicly joinable by default (`join` auto-admits every student into a public class, `autoAdmit = isPublic || validInvite || isAdmin`). Approval queue only applies to private classes entered without the code.
- **Join code:** `SYN-` plus 6 chars from an unambiguous alphabet (`lib/validation/classes.ts`), crypto-random, unique-checked 3 times (not atomic, so a collision race is theoretically possible).

### B5. Student enrolment (join by code / request)
- **Status:** Working.
- **Backend:** `app/api/classes/[id]/join/route.ts`: transactional, rate limited 10/min, code optional. Public: instant. Private plus valid code: instant. Private without code: pending plus notification to teachers. Enrollment doc id `${classId}_${uid}`.
- **Limitation:** the join endpoint requires the class id, so "type my teacher's code" depends on the UI resolving a `SYN-` code to an id; `class-join-gate.tsx` and `classes/suggest|recommend` exist. I did not trace whether a code alone, without the class link, resolves a class.
- **Evidence:** `app/api/classes/[id]/join/route.ts`, `components/classes/class-join-gate.tsx`.

### B6. Lecturer dashboards and class analytics (heatmap)
- **Status:** Working but narrow.
- **Frontend:** `app/(app)/classes/heatmap/page.tsx`, `classes/[classId]/heatmap/page.tsx`, `components/classes/mobile-heatmap.tsx`.
- **Backend:** `app/api/classes/[id]/heatmap/route.ts` (teacher or admin): per-student row (email, XP, streak, `averagePL`, `masteredCount`) and per-topic `averagePL`, `masteredPercentage`, `strugglingPercentage`, from the `mastery` collection (BKT `pL`).
- **Missing:** no misconception aggregation (the route never reads `misconceptions`; `git grep` shows misconceptions are read only in `map`, `me/learner-state`, learner-DNA and tutor code, all per-learner). No time-on-task, no content engagement (the `read/signal` route records reading but nothing aggregates it for teachers in what I read), no export, no alerting.
- **Class-level reports:** `classes/[id]/reports` lists student bug reports about content (`bugReports`), a useful content-quality signal.

### B7. Assignments
- **Status:** Partial. Read-only worksheet generator.
- **Frontend:** `app/(app)/classes/[classId]/assignments/page.tsx`.
- **Backend:** `assignments/generate/route.ts` (AI, creates `status: "draft"`), `assignments` (list; students see only `published`), `assignments/[assignmentId]` (PATCH status, DELETE). `lib/teacher/assignments.ts` (zod schemas: theory questions with rubric and exemplar answers, practical experiment), `assignmentAgent.ts`.
- **What is missing (verified):** no POST for student submissions, no due date field in the page, no scoring, no teacher view of who did it. The only submit-and-grade machinery is the separate Auto-grading feature (`app/(app)/teach/grading`, `app/api/grading/**` with `submit` and `override`), which is not linked to class assignments.
- **Impact:** a lecturer who "assigns practice" gets a printable document, not tracked work.

### B8. Attendance
- **Status:** Working.
- **Frontend:** `app/(app)/teach/attendance/page.tsx` (copy link, code display).
- **Backend:** `app/api/attendance/**` (create session, close, report, mine, checkin); `lib/attendance/logic.ts` (+ test): 6-char code, default 10-minute window, late after 5 minutes. Check-in is rate limited per user (6/min, 30/hour) and per IP (60/min) with identical errors for wrong, expired and not-enrolled codes. Create and report need `assertClassAccess(mutate)`.
- **Limitation:** code can be shared by anyone present remotely; no geofence, which is a product decision, not a bug.

### B9. Class announcements
- **Status:** Working. `app/(app)/classes/announcements/page.tsx`, `app/api/announcements/**` (create, read receipts, mark read). Also school-wide announcements (B2).

### B10. Class publishing controls
- Covered in detail in the Lecturer journey (section D) because it is the most important institutional control.

### B11. Class creation wizard and AI class build
- **Status:** Working.
- **Backend:** `classes/[id]/build/route.ts` (maxDuration 300 s; teacher or admin; `assertClassAccess(mutate)`), `lib/teacher/classBuilder.ts`, `classBuildRequest.ts`, `seedMaterial.ts`, `planner.ts`, `recommend.ts`; `classes/[id]/syllabus/generate`, `classes/recommend`, `classes/suggest`.
- **AI:** task `class_build` in `lib/ai/tasks.ts` through the router. Idempotent: KC ids are slugs, written with `merge`.
- **Cost controls:** there is no `checkRateLimit` on the build route, no `checkFeature("class_build")` anywhere in `app/` or `lib/` (H3), and teachers have no token cap while billing is off (`budgetOf`: `uncapped = role teacher && !enforced`). A buggy client or a hostile "teacher" (see H1) can run unbounded class builds against the shared AI keys. The only brake is the optional OpenRouter daily cap and the global kill switch.

---

# PART C. COMMERCIAL

### C1. Plan catalogue (`lib/billing/plans.ts`)
- **Status:** Working as configuration.
- **Plans:** student ladder `free` (Seed), `exam` (Exam Pass, 1,500 NGN/month, 5,000/term), `plus` (3,500; 11,000), `pro` (6,000; 19,000), retired `promax` and `ultra` (still honoured for existing holders). Teacher ladder `teacher` (7,500; 20,000), `teacherpro` (15,000; 40,000). `school` (1,200 NGN per student per term, invoice). Unpaid teachers get `TEACHER_TRIAL` (Free limits plus 2 class builds and 1M tokens). Admins get the Teacher plan. Term = 135 days, month = 30 days.
- **Metered features:** `notes`, `scan_pages`, `lessons`, `practice`, `studio_ai`, `class_build`, plus `monthlyTokens` and `perMinute`.
- **Evidence of where limits are actually checked (`git grep checkFeature`):** `app/api/documents/read` (scan_pages), `app/api/study/notes` (notes), `study/notes/[id]/practice` (practice), `app/api/teach` (lessons, only for the personal-notes branch). `studio_ai` and `class_build` are never checked; class-topic lessons are not counted.
- **Price inconsistencies to confirm with the owner:** `Plus` and `Pro` both carry badge "Most popular"; Pro perk text says "three times the room of Plus" while monthly tokens are 2.5x (3.0M vs 1.2M) and scanned pages 2.5x; the ladder drops from Plus to Pro in a way `nextTier` handles correctly, but the teacher plans' `monthlyTokens` (15M/40M) have no revenue model I could verify (another agent owns economics).

### C2. Paystack: checkout, verify, webhook
- **Status:** Working in code; Unknown in production (depends on `PAYSTACK_SECRET_KEY`).
- **Frontend:** `app/(app)/plans/page.tsx` (returns with `?paid=1&reference=`), `components/billing/*`.
- **Backend:**
  - `POST /api/billing/checkout` (6/min): validates plan is payable and `canBuy` (teacher plans need a teacher or admin role), requires an email, builds our own reference, calls Paystack `transaction/initialize` with all channels (card, bank, USSD, transfer, QR, mobile money, Apple Pay), metadata `{uid, plan, term}`, amount from `priceFor` server-side (client cannot set price). If the secret is missing returns 503 "Payments aren't set up yet".
  - `GET /api/billing/verify`: calls Paystack verify with the secret, rejects other users' references, then `activatePayment`.
  - `POST /api/billing/webhook`: HMAC-SHA512 signature check with timing-safe compare, then `readCharge`.
  - `lib/billing/paystack.ts` `readTransaction` enforces currency NGN and `amount >= priceFor(plan, term) * 100`. `lib/billing/activate.ts` is a Firestore transaction keyed on `payments/{reference}`, so webhook plus verify cannot double-apply.
- **Database:** `payments/{reference}`, `users.plan`, `planTerm`, `planExpiresAt`.
- **Findings:**
  - Teacher-plan purchase requires the teacher role first (good) but the page for a pending teacher does not explain that (copy says "Ask to become a teacher first").
  - Re-buying the same plan extends the expiry; buying a different plan restarts from now and forfeits remaining paid time (`activate.ts` comment: "starts from now instead of stacking"). Upgrading Plus to Pro mid-term wastes the unused Plus time; no proration or refund path exists in code.
  - No subscription auto-renewal: each payment is a one-off pass. No cancel, invoice or receipt route in `app/api/billing`.
  - A paid school-sponsored user is never overwritten (`sponsorshipPatch`), good.
  - `activatePayment` returns false if the user doc is missing and the webhook still replies `{ok:true, applied:false}`, so Paystack stops retrying: a payment can be lost silently. Edge case.
- **Admin:** `app/api/admin/billing/{config,overview,people}` and `components/billing/admin-*`, `enforcement-panel.tsx`; admin can grant plans (`planGrant` kinds gift or trial) and reset a test account's usage (`usageResetAt`).

### C3. BILLING_ENFORCED: what actually happens when unset (verified)
Resolution order (`lib/billing/config.ts` `resolveEnforced`): a saved admin choice in Firestore `config/billing` (`off` | `testers` | `all`) wins; if no choice was ever saved, the env var `BILLING_ENFORCED=1` decides; otherwise **off**. `docs/antigravity/BUILD-THE-APP.md` and `PAYSTACK-SETUP.md` instruct operators to leave it unset, and `docs/worlds/PHASE0_FINDINGS.md` records "currently Off".

When off (the default):
1. `checkFeature` returns immediately: notes, scans, lessons, practice are unlimited per plan; usage is still counted (`recordFeature`).
2. `pickNudge` returns null (`if (!me.enforced) return null`): no 80% warnings or welcome.
3. The upgrade dialog only appears when an API returns `PLAN_LIMIT` or `QUOTA_EXCEEDED` (`lib/billing/upgrade-event.ts`, `lib/api/client.ts`). `PLAN_LIMIT` can never fire. `QUOTA_EXCEEDED` still can (next point), so the upgrade prompt fires on the flat token cap even though "billing is off".
4. The token and rate limits are NOT off (`lib/quota/guard.ts` `budgetOf`): a student's cap is `monthlyTokenLimit || STUDENT_DEFAULT_LIMIT (50,000)` and 10 requests per minute; teachers and admins have no token cap (`uncapped`) and 60 requests per minute; paid plans raise the token floor and speed only when enforced.
5. Display mismatch: `GET /api/billing/me` reports token limit `max(monthlyTokenLimit||0, enforced ? plan.monthlyTokens : 0) || plan.monthlyTokens`, so a free student sees 100,000 on the Plans page while the guard enforces 50,000 (the Profile page shows 50,000). A student can be told "quota exceeded" at half the number the Plans page advertises.
6. Consequence for revenue: with billing off, paying buys nothing the student can feel except a higher per-minute rate after enforcement, so the checkout works but the value proposition is unproven.
7. `testers` mode: only listed UIDs are limited and can see the upgrade pop-up (cached 10 s). The 10-second cache means a mode flip is not instant across instances.

### C4. Monthly quotas and usage tracking
- **Token budget:** `lib/quota/guard.ts` reserves estimated tokens in a Firestore transaction before the model call, settles with real usage, releases on failure; reservations expire after 10 minutes (`quotaReservations`). Well designed. Period key = UTC month.
- **Feature counters:** `users.featureUsage.{YYYY-MM}.{feature}` incremented with `FieldValue.increment` after success (`recordFeature`). Never charged on failed AI calls.
- **Surface:** `GET /api/billing/me`, `GET /api/me/usage`, `components/billing/*` usage meters, Plans page.
- **Gaps:** counters for `studio_ai` and `class_build` stay at zero forever (nothing records them), so the usage meters for those rows are always empty (H3).

### C5. AI spending controls
- **Per-user:** token reservation and per-minute limit (above); admin can set `monthlyTokenLimit` per user (`admin/users/[uid]`).
- **Global:** an admin cost kill switch (`/admin/controls`, referenced in `lib/ai/router.ts` before any reservation) and an OpenRouter daily dollar cap (`lib/ai/openrouter-spend.ts`, default `DEFAULT_DAILY_CAP_USD = 1.5`, collection `aiSpend`, per-day document, counts failed calls too, estimate deliberately high). Admin screens under `app/api/admin/system/*`, `admin/usage`.
- **Gap:** the dollar cap covers OpenRouter only. Gemini and Groq spend (the primary providers per `CLAUDE.md`) has no equivalent daily dollar cap in the files I read; they are bounded only by per-user tokens and the kill switch. UNKNOWN whether those providers have provider-side budgets.
- **Gap:** teacher/admin uncapped tokens while billing is off (H2, H1).

### C6. Upgrade prompts and nudges
- **Status:** Working but dormant while billing is off.
- **Frontend:** `components/billing/upgrade-dialog.tsx` mounted in `app/(app)/layout.tsx`; nudge picker `lib/billing/nudge.ts` (+ tests) shows one notice: an 80% warning for the worst feature or a one-time welcome for free users.
- **Limitation:** copy comes from `limitMessage` and names the next plan up; there is no prompt for the real current blocker (the 50,000-token flat cap) in plan terms because that error says "Quota resets at the beginning of next month" without a plan suggestion.

---

# PART D. LECTURER JOURNEY (registration to class performance)

Legend: [V] verified in code, [P] partial, [X] broken or missing.

1. **Register.** Sign-up page: choose Teacher, enter name, email, password, optional @username. [V] Account is created as a student with `roleRequest: "pending"`. Auto-approval only if the email is on the `ADMIN_EMAILS` allowlist and verified. Otherwise the lecturer waits for an admin to flip the role in the admin console, with no notification either way [X]. While waiting, "Create a class" does not appear (`isTeacher` false in `classes/manage/page.tsx`).
2. **First sign-in.** The five-step Sprout overlay (`components/profile/profile-setup.tsx`) asks for username and picture, school, department and year, focus areas, then "Start Free" or "Get Semester Pass". It is written for students ("What are you studying? ... tailor the syllabus"). A lecturer answers student questions. "Skip for now" only hides it for the session; it returns on the next load while `profileSetup` is false [P].
3. **Create a class.** Path: My classes, then "Create a class", which links to `/explore?create=1` (create lives inside the discovery page) [P]. Wizard collects title (3 to 100), subject, description (10+), level, weeks, visibility, audio options. `POST /api/classes` writes `classes/{id}` with `teacherId`, a `SYN-xxxxxx` join code, `status` published by default unless the wizard asks to draft [V]. Class ownership: creator is owner; co-teachers via `coTeacherIds` (no UI/API for a teacher to add one found) [P].
4. **Upload syllabus and slides.** `MaterialsUploader` calls `materials/init` (PDF, DOCX, PPTX, TXT, MD, CSV, images; 100 MB cap), then `materials/[mid]/complete`; ingestion in `lib/teacher/materialIngest.ts`. Needs `mutate` access [V]. Material router (`lib/teacher/materialRouter.ts`) proposes map changes (`add_kc`, `merge_into`, `attach_material`, `add_prereq`, `split_kc`) as `mapProposals`; the lecturer applies or dismisses each [V]. That is a real human-in-the-loop step for structure.
5. **Generate the class.** `POST classes/[id]/build` (up to 300 s) turns syllabus plus seed notes into topics (KCs) with prerequisites (cycle detection), BKT priors, objectives and weeks; marks the class `ready` or `needs_review` with clarifying questions [V]. Only the first three topics get a stub lesson (`idx < 3`: title, description, objectives), so most topics are empty shells [V]. The topics are written `status: "draft"` with no `contentPublished` map.
6. **Generate content per topic.** Separate calls for lesson (`kcs/[kcId]/lesson`), podcast audio, simulation, practice bank, labs, quests, pieces. All teacher-only for generation (`canMutate`) [V]. Slow and per-piece: a lecturer must click through many generators per topic [friction].
7. **Review and edit AI output.** The lecture note can be edited via `PUT kcs/[kcId]` (any `lessonMarkdown` >= 10 chars) [V]. There is a pedagogical quality gate (`lib/teacher/qualityCheck.ts`) and a separate "Content Review" screen (`classes/[id]/manage/content`) with approve/reject [V for the screen]. **That screen is an illusion (H6):** its approvals live in `contentCache`, and no student-serving code reads them. It is linked only from the admin console, not from the lecturer's class page.
8. **Organise topics and knowledge components.** Learning map and mind-map views (`components/classes/learning-map.tsx`, `class-mind-map.tsx`), topic PUT for `prerequisiteIds`, `bkt`, `lab`. DELETE of a topic hard-deletes the doc [V] and leaves student `mastery` rows orphaned [P]. Merging topics (via proposal) archives the source and sets `mergedInto`, which no code reads, so a student's progress on the merged topic is stranded [V].
9. **Publish.** Three levels:
   - Per piece: `kcs/[kcId]/publish` pushes a snapshot of lecture note, audio, simulation or practice (`lib/classes/live.ts`, "like git"): students read only the pushed snapshot; later edits stay private until pushed again [V]. This is the strongest design in the lecturer flow.
   - Whole class: `Publish Class` (`classes/[id]/publish`) marks every non-archived topic `published` and pushes everything that exists; refuses on prerequisite cycles or zero topics. `publish-content` pushes or hides everything. The confirm dialog literally says "Drafts you haven't reviewed will go live too." [V]
   - Per topic, per content type, plus per-lab flags [V].
   - **Can AI content be published without human review?** Yes (H5): one confirm click publishes every unreviewed AI draft. Also, `POST /api/teach` generates the Interactive Lesson script from a student's first open, saves it on the topic (`teachScript`), and serves it to all students thereafter, never passing through the teacher or the publish map [V]. The student who triggers it spends their own token budget on class content, which contradicts the design note in `lib/classes/published.ts` ("students never trigger generation").
   - **Can unpublished content leak?** Three routes, in descending severity:
     1. Taking a lesson offline does not remove `teachScript`; `POST /api/teach` returns a stored script before any publish check [V, MEDIUM-HIGH].
     2. Firestore rules let an enrolled student read the raw `kcs/{kcId}` document directly when its `status == 'published'` (`firestore.rules`, kcs block), and that document holds the teacher's working-copy `lessonMarkdown` even in snapshot mode (the API deliberately hides it, the rules do not) [V from rules plus `live.ts`; exploitable only with the Firebase web SDK, not via the UI].
     3. `GET /api/classes/[id]/map` builds the learning path from all KCs without filtering `draft` status, so students enrolled in a class can see draft topic titles and descriptions (the main class route filters drafts, the map route does not) [V]. Also `GET kcs/[kcId]` does not reject `status: "draft"` for students; draft AI-built topics have no `contentPublished` map, so `publishMapOf` treats all four content types as published ("legacy follow") and the starter stub lesson would be returned for a direct id fetch [V from code, requires knowing a topic id].
   - **Topics applied from an uploaded material** are written `status: "published"` immediately with no `contentPublished` map (`materialRouter.ts`, `add_kc`), so a new topic appears to students before any content exists [V].
   - **Can materials be updated without breaking progress?** Mostly yes: mastery is keyed `uid_kcId` and independent of content text; snapshots isolate students from edits; AI rebuild uses stable slugs with merge. Exceptions: merge (above), delete (above), and `teachScript` going stale after the lecture note changes [V].
10. **Assign practice.** See B7. Produces a worksheet only (H8). Practice banks (quiz/flashcards) are what actually drive student mastery and are published per topic [V].
11. **View class performance.** Heatmap (B6): per-student, per-topic BKT mastery, struggling percentage by topic [V]. Announcements with read receipts [V]. Attendance report [V].
12. **Spot weak topics.** The heatmap's `strugglingPercentage` and `averagePL` rank topics [V]. 
13. **Spot misconceptions.** Not available to teachers (H7) [X].

**Lecturer friction points**
- Waiting for approval with no signal; no verification standard.
- Student-oriented onboarding shown to a lecturer.
- Class creation hidden inside Explore; school features hidden from the main nav.
- Build produces empty shells for most topics; many separate generate buttons per topic; no "generate everything for this topic" or "generate for the class" progress view that I could find.
- Review is by hand with no diff or "changed since pushed" view in bulk (a per-key `changed` flag exists in `liveStatus` but "Publish all content" overrides it with one confirm).
- Two overlapping review/publish concepts (snapshot push vs Content Review) confuse.
- A default `published` and `public` class means an unfinished class can be joined by anyone.
- No class-level view of misconceptions, engagement or who has not started.
- No co-teacher invite flow; no archive-for-new-semester or clone-class flow found; no export of results.
- The Teacher plan advertises "25 AI class builds" and "Class mastery heatmap, grading help", yet builds are uncounted and the heatmap is free for any teacher.

---

# PART E. STUDENT JOURNEY

1. **Register.** Email or Google sign-up (`app/(auth)/signup/page.tsx`): role toggle, name, optional unique @username. [V]
2. **First sign-in profile step.** `ProfileSetup` overlay (`components/profile/profile-setup.tsx`, 811 lines; server `app/api/profile/setup/route.ts`): step 1 username (at least 3 chars; availability checked server side) and picture (keep Google photo, pick a preset, or upload a JPEG up to 90 KB), step 2 school (directory from `/api/schools?mode=directory`), step 3 department and year, step 4 focus areas, step 5 "Start Free" or "Get Semester Pass". [V] Notes:
   - Five steps for a first minute is heavy; "Skip for now" hides it only for the session and it reappears next session while `profileSetup` is false, which is nagging, not onboarding.
   - Uniqueness of username is query-then-write, not a transaction, so two simultaneous sign-ups can claim the same handle (low probability) [P].
   - The picture step is bundled with a purchase upsell on the final step; "Get Semester Pass" on first run sets expectations that the free tier is a trial.
   - A school-linked student keeps the school's institution and department (server ignores the form values), good.
3. **Discover and join a class.** Explore page (`/explore`), class recommendations (`classes/recommend`, `suggest`), join by link or code (B5). Public classes admit instantly; private ones need the code or approval. Visitors see a landing preview only (title, description, topic titles); lessons require enrolment [V]. The primary nav label is "My classes", and find/create sit in a tab pair (`CLASS_TABS`), reasonable.
4. **Open a topic.** Class page lists topics with mastery and prerequisites (`classes/[id]`, `map`). Draft topics hidden on the class route [V] (but not on map/direct id, see D9).
5. **Read and listen.** "Read & listen" tab: lecture note (localised per student language, translated once and stored) and the pushed podcast snapshot [V].
6. **Ask Sprout / tutor.** Global tutor launcher in the layout (`TutorLauncher`), in-topic "AI Tutor" tab, `/tutor`, voice tutor `/tutor/voice`, Sprout mascot overlays (`BotProvider`), "Ask" board. Spends the personal token budget; at 50,000 tokens a month for a free student while billing is off (C3) the tutor can stop mid-month, with a message that does not say what to do [V].
7. **Practise.** Tabs: Interactive lesson, Piece by piece, Simulation, Flashcards, Quiz, "Prove it", "Build & test", AI Tutor: up to nine tabs per topic (`topics/[kcId]/page.tsx`, 960 lines). Which tabs show depends on `resolveProfile(kc).needs`, so the topic page changes shape by topic [V]. Step numbers 1 to 5 exist but "Interactive lesson" and "Simulation" are both step 2, "Piece by piece", "Build & test" and "AI Tutor" are unnumbered, and the "Prove it" tab uses a shopping-cart icon [V, copy/IA defects].
8. **Quizzes and flashcards.** Quiz answers feed BKT mastery and misconception tracking (`quiz/[sessionId]/answer`, `lib/teacher/misconceptions.ts`); flashcards use FSRS (`lib/fsrs`). Practice content for class topics is the teacher's pushed bank and costs no AI [V]. Personal practice from own notes is metered (`practice` feature) [V].
9. **Simulations and Worlds.** Simulations are teacher-pushed class content under the "Simulation" key; Worlds (`/worlds`) is the separate upload-your-notes-and-learn-as-a-game feature (audited by another slice). Two different "learn your own material" paths exist: Study notes, and Worlds, plus Notebook, Snap, Papers.
10. **Check mastery.** Mastery appears per topic (class page, map, dashboard "DNA strip", `me/learner-state`), plus XP, level, streak, league. Mastery is BKT `pL` with `MASTERY_THRESHOLD`; the learner-facing label ("novice, emerging, competent, mastered") is shown on the topic page [V].
11. **Return.** Daily path on the dashboard, streak reminders by push (18:00 UTC cron, not per-timezone: 19:00 in Lagos, which is reasonable for the target market, but late for Asian or Americas users), goal reminders (07:00 UTC), Daily 5 challenge [V].

**Student friction points**
- Too many steps and surfaces: five-step onboarding; nine tabs in one topic; 45 features listed on "Everything".
- Confusing navigation: the Community hub lists six tiles but omits Communities, Groups, Mentors, Polls, Shout-outs, Tutors; those exist only under the Everything page or direct links. Schools is not in the nav at all. Two DM inboxes (H9). Community has three "group" concepts (communities, study groups, lounge rooms) and two "session" concepts (study sessions, focus rooms).
- Redundant or competing features: Study notes vs Worlds vs Notebook; Flashcards in topics vs `/study/flashcards`; Daily 5 vs Quiz; Tutor in four places; Streak vs Quests vs Goals vs Leagues vs Referral XP all competing for the "keep me coming back" slot.
- Weak onboarding to the product's core promise (class mastery): the onboarding asks about school and department but never explains "join a class with your teacher's code" or offers a code box.
- Unclear subscription limits: Free shows a monthly allowance of 100,000 tokens on the Plans page but the guard stops at 50,000 (C3); limits are described in "notes sets", "lessons", "tokens", which a student cannot map to what they did; no in-context meter inside the tutor; the upgrade prompt appears only after a block.
- Missing progress feedback: after the quiz there is a toast-level "take the quiz to count toward your mastery" nudge on the interactive lesson; I found no explicit "you moved from 35% to 52% on this topic" summary but did not read all quiz result components, so Partially verified.
- Small screens: topic tabs scroll horizontally (`overflow-x-auto`), the bottom bar has four primary items plus a More sheet, the main container has safe-area padding, the layout mounts eight floating overlays (tutor launcher, calculator overlay, command palette, add-material sheet, update banners, site notice, verify-email banner, upgrade dialog) that compete for a 360 px viewport. Not rendered by me, so MEDIUM confidence.
- A free student can burn their entire monthly token allowance on the first-open Interactive Lesson of a class topic (`/api/teach` reserves 7,000 tokens per generation) even though the teacher "paid" for content; a 50,000 cap is about seven such generations.

---

# PART F. STRONGEST AND WEAKEST FEATURES OF THIS SLICE

### Five strongest
1. **Snapshot publishing** (`lib/classes/live.ts`, `publish-all.ts`): git-like push, drafts isolated from students, per-key change detection, tested. The right model for teacher control.
2. **Payment hardening** (`lib/billing/paystack.ts`, `activate.ts`, the three routes): server-side price, signature verification, amount and currency checks, idempotent activation by payment reference, verify-after-redirect fallback.
3. **AI token reservation** (`lib/quota/guard.ts`): reserve, settle, release in transactions; concurrent-safe; failed calls not charged; kill switch and OpenRouter cap layered on top.
4. **Attendance** (`lib/attendance/logic.ts`, `app/api/attendance/**`): small, scoped, rate-limited, uniform errors, unit tested.
5. **Focus rooms** (`lib/focus/timer.ts`): synced timer from a shared anchor, presence window, member cap, tests. (Honourable mentions: school invite join with transactional seat and one-school check; streaks with freezes and recovery.)

### Five weakest
1. **School portal role escalation and seat model** (H1, B2): any user can mint teachers; orphan public schools; seats never freed; invented readiness defaults on a dashboard sold to principals.
2. **Plan metering** (C1, C3, H3): `class_build` and `studio_ai` unmetered; flat 50,000 cap versus advertised 100,000; billing off by default so pricing is unproven.
3. **Study lounge** (A5): roster/PII leak, listable and auto-joinable "private" rooms, farmable credit.
4. **Assignments and Content Review** (B7, D7): decorative review, worksheet with no submission or tracking.
5. **Social sprawl and duplication** (A4, A7, A12 and Part E): two DM systems, three group concepts, three streak libraries, themes that barely recolour the UI.

### What should be removed or simplified
- Remove the Content Review screen or wire it to student serving; do not leave a button that says "now live" when it is not.
- Retire `direct_chats` and the `/api/messages` route; merge into `chats`.
- Merge Study groups, Communities and Lounge rooms into one "groups" concept, or at least one entry point.
- Collapse the three streak modules into one.
- Remove retired plans (`promax`, `ultra`) from UI paths and gate unused plan fields (`TEACHER_TRIAL.class_build`) until metered.
- Either meter `class_build` and `studio_ai` or stop advertising them.
- Rework shop themes to the brand scale or drop them.
- Reduce the topic page to three visible tabs (Learn, Practise, Ask) with the rest as sections.
- Shorten onboarding to username plus picture, with school and code entry as optional later cards; give lecturers a lecturer-specific first run.

---

## Open questions

1. **Is `BILLING_ENFORCED` set in the live Vercel environment, and what does `config/billing` in Firestore say?** Why it matters: it decides whether every limit in Part C is real or dormant, and whether students see the 50,000 versus 100,000 mismatch. Who can answer: the founder/admin with Vercel and the `/admin/billing` screen. Evidence: Vercel env list (names only), the `config/billing` document, `/api/billing/me` output for a test student.
2. **Has H1 been used?** Check `users` for `role == "teacher"` whose `roleRequest` was never `approved`, and `schools` with `principalUid` set whose principal has role teacher. Who: admin with Firestore access. Evidence: query results and `auditLogs`.
3. **Do public schools registered through `public_register_school` have any owner?** Count `schools` with `principalUid == ""` and their `studentCount`. Who: admin. Why: orphan, sponsored seats with no manager.
4. **Are `studio_ai` and `class_build` deliberately unmetered?** Who: product owner. Evidence: a decision note in `docs/DECISIONS.md` (not read in full) or intent to wire `checkFeature` into `classes/[id]/build` and studio AI routes.
5. **Which provider budgets cap Gemini and Groq spend?** The code only caps OpenRouter in dollars. Who: whoever holds the provider consoles. Evidence: console budget/alert screenshots. Why: the cost kill switch is manual.
6. **Does `applyEvidenceIfEnrolled` cap peer-explain evidence per user per day?** I did not read `lib/evidence/apply.ts`. Who: an engineer reading that file or a test. Why: decides whether the room-credit farming in A5 is real.
7. **Does the live product build and serve the student UI from `/api/classes/[id]/kcs/[kcId]` or from direct Firestore reads?** Why: determines whether the rules-level draft leak (D9, item 2) is reachable by ordinary users. Evidence: network trace of a student session or grep of client Firestore usage (I found none for `kcs`, which suggests the API only, but did not search exhaustively).
8. **Is there a mobile app share of traffic and do Android users receive push?** Native app lives in `sunroot-mobile`; its FCM wiring is not in this repo. Who: mobile owner. Evidence: that repo and the push-token collection counts by user agent.
9. **What is the real adoption of mentors, polls, shout-outs, explainers and communities?** Code cannot tell. Who: product owner. Evidence: Firestore collection counts and weekly active users per feature. Why: decides what to cut.
10. **Is the unsent `studentCount` decrement on leaving a school deliberate?** And is there a manual admin path to remove a member? Who: school-portal owner; evidence: admin console code (`app/(app)/admin/page.tsx` not read in full).
11. **Who may add a co-teacher?** Only admin self-join found. Who: product owner. Evidence: UI in `classes/[classId]/manage` (I read only the first 100 lines of the manage page).
12. **Are APK files in `public/` intentionally tracked?** Contradicts `CLAUDE.md`. Both are identical in size (8,889,184 bytes), which suggests a duplicate. Who: repo owner. Evidence: `git log -- public/*.apk`.
13. **Admin-side areas not read:** `app/(app)/admin/page.tsx` (large), `components/billing/admin-*`, `lib/ai/router.ts` kill-switch internals, `lib/evidence/apply.ts`, `lib/pet/*`, explainers video storage, quest/season logic, and the quiz result components. These were outside the time I had; statuses for them are Partially verified or Unknown.
