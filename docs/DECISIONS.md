# Synapta — Architecture & Design Decisions (DECISIONS.md)

This log records architectural and design decisions, trade-offs, and deviations or clarifications throughout the build of Synapta.

---

## Decision 1: Authentication & Identity Model
- **Context:** The draft research paper proposed a deterministic email-derived user ID for passwordless access.
- **Decision:** As mandated by the Master Prompt Section 8, we strictly use standard Firebase Authentication (Email/Password + Google OAuth). The primary user identifier is Firebase `uid`.
- **Rationale:** Email-derived identifiers allow identity impersonation without authentication proof. Firebase Auth provides cryptographically signed ID tokens and session cookies with role claims.

## Decision 2: Role Management & Custom Claims
- **Context:** Synapta supports three roles (`student`, `teacher`, `admin`).
- **Decision:** Roles are stored in Firebase Auth custom claims (`{ role: "student" | "teacher" | "admin" }`) AND mirrored in Firestore `users/{uid}.role`.
- **Rationale:** Custom claims allow zero-database latency route protection in Next.js middleware and token verification, while the Firestore mirror enables administrative queries and profile rendering.

## Decision 3: Server-Side AI SDK & Model Configuration
- **Context:** Google Gemini models evolve, and server credentials must never leak.
- **Decision:** Use the official `@google/genai` SDK strictly inside server route handlers (`runtime = "nodejs"`). Model identifier is resolved dynamically from `process.env.GEMINI_MODEL` (e.g., `gemini-3.8-flash`), with automated fallback and sanitization for legacy identifiers.
- **Rationale:** Guarantees zero client bundle leakage of API keys, and allows model upgrades without code changes.

## Decision 4: Rate Limiting & Token Quota
- **Context:** AI generation calls must be protected against abuse and exhaustion.
- **Decision:** Rate limiting uses a sliding-window in-memory map per user (max 10 calls/minute), and monthly token quotas are tracked transactionally in Firestore `users/{uid}.monthlyTokensUsed` and `usage/{uid_YYYY-MM}`.
- **Rationale:** In-memory rate limiting suffices for single-instance or serverless cold-start windows in v1; transactional Firestore writes ensure strict quota enforcement across distributed serverless executions.

## Decision 5: Client-Side PDF Text Extraction
- **Context:** Firebase Storage on new Google Cloud projects requires a paid plan (Blaze) in v1.
- **Decision:** PDF parsing is performed client-side using `pdfjs-dist`, and only extracted text chunks are transmitted to `/api/notebook/sources`.
- **Rationale:** Completely avoids paid storage requirements while delivering instant in-memory text parsing with zero cloud storage costs.

## Decision 6: Styling & Theme Architecture
- **Context:** Clean, calm aesthetic avoiding generic purple gradients; full light & dark mode support.
- **Decision:** Custom CSS design system with CSS custom variables for Deep Ink (`#0B0F14`), Warm Off-White (`#F7F6F2`), Teal accent (`#14B8A6`), and Amber secondary (`#F59E0B`). Persisted via `synapta-theme` in `localStorage` and applied to `<html>` class.
- **Rationale:** Ensures high contrast (WCAG AA), accessible focus rings, and seamless hydration without flash of unstyled theme.

## Decision 7: Centralized ApiError & Leaked Provider Information Defense (A2)
- **Context:** Heterogeneous errors across auth, class authorization, rate-limiting, and AI exhaustion previously returned generic 500s or leaked raw provider JSON payloads (e.g. Google Cloud 429 quota failure dumps).
- **Decision:** Centralized `ApiError` base class in `lib/api/errors.ts` extended by `AuthError`, `ClassAccessError`, `QuotaError`, and `AiQuotaExhaustedError`. Enforced uniform `{ ok: false, error: { code, message, requestId? } }` responses via `toErrorResponse(err, requestId)`. Mask unhandled 500 exceptions with opaque error messages while capturing request IDs for server-side logs. Intercept any leaked upstream provider quota payloads and map them to friendly `AI_QUOTA_EXHAUSTED` responses with `Retry-After` headers.
- **Rationale:** Prevents information disclosure vulnerabilities, protects users from cryptic provider payloads, and guarantees uniform client error contracts.

## Decision 8: XP & Mastery Integrity Defense (A3)
- **Context:** Vulnerabilities allowed client-claimed peer explain rewards, unbounded flashcard grind loops, repeat harvesting of +100 XP mastery bonuses by cycling mastery probabilities, and parallel double-scoring races in quiz sessions.
- **Decision:**
  1. Deprecated self-claimed `peer_explain` on `POST /api/evidence`; peer rewards must be granted by other peers via `POST /api/lounge/rooms/[roomCode]/credit` within an active study room.
  2. Rate-limited daily flashcard evidence submissions to 30/day per concept in `applyEvidence`.
  3. Added `masteryBonusAwardedAt` tracking in `mastery` documents to ensure the +100 XP mastery bonus is awarded strictly once per concept lifetime.
  4. Added `safeBktParams` to enforce model identifiability ($p_G + p_S < 1$) and sanitize priors.
  5. Transaction-wrapped quiz answering in `app/api/quiz/[sessionId]/answer` to atomically claim answers and eliminate parallel submission double-scoring.
- **Rationale:** Protects pedagogical integrity, prevents leaderboard exploitation, and mathematically guarantees valid BKT inference.

## Decision 9: Authorization Hardening & Security Rule Integrity (A4)
- **Context:** Study room endpoints (messages and scratchpad) were open to unjoined authenticated callers; non-admin users could attempt joining draft classes.
- **Decision:**
  1. Enforced room membership checks (`memberIds.includes(caller.uid) || caller.role === 'admin'`) in both `POST /api/lounge/rooms/[roomCode]/messages` and `PATCH /api/lounge/rooms/[roomCode]/scratchpad`.
  2. Enforced classroom published state check in `POST /api/classes/[id]/join`, rejecting student enrollments into draft classes.
  3. Verified Firestore rules allowlist patterns and user profile mutation constraints with unit test coverage.
## Decision 10: Course Schema, Prompt Injection Fencing, and Dynamic Task Model Routing (B1, B11, B7.1-B7.2)
- **Context:** Course data models required rigorous type safety for Knowledge Components, Lessons, Materials, and Assignments. Untrusted user content needed injection defense without corrupting STEM LaTeX equations. Teacher cache hash keys risked multi-tenant cross-class collisions. Model routing needed real-time administrative reassignment without redeploying.
- **Decision:**
  1. Established comprehensive Zod schemas and TypeScript models in `lib/validation/course.ts` and `lib/types/course.ts`.
  2. Implemented `createKc`, `updateKc`, and deduplicated `upsertAiKc` in `lib/teacher/kcStore.ts` with BKT parameter validation and slug stabilization.
  3. Created `fenceUntrusted` in `lib/ai/generate.ts` with XML tagging and closing delimiter neutralization.
  4. Updated `scrubPii` to protect LaTeX math blocks (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) during sanitization using a replacer function to avoid `$$` escape artifacting.
  5. Scoped `computeContentHash` with `classId` in `lib/teacher/cache.ts` for secure multi-tenant cache isolation.
  6. Added dynamic Firestore model routing via `systemConfig/aiModels` with 60-second in-memory caching and an administrative console UI.
- **Rationale:** Guarantees end-to-end data integrity for classroom curriculum generation, prevents prompt injection escapes, protects mathematical equations from regex damage, isolates cache spaces, and gives administrators instant operational control over Gemini model deployments.

## Decision 11: Real PDF Upload Pipeline & Map Proposal Rollback Isolation (B3-B4)
- **Context:** Course syllabus building required real PDF material uploads (textbooks, slides, past papers). Relying purely on Cloud Storage could fail if the storage bucket was unconfigured or lacked Blaze plan permissions. Curriculum proposals mutated the live concept map and needed atomic execution and full rollback snapshots.
- **Decision:**
  1. Implemented dual-path PDF upload in `components/teacher/MaterialsUploader.tsx`: uploads directly to Cloud Storage via signed PUT URL if available; if unconfigured or failing, automatically falls back to client-side text extraction using `extractTextFromFile` with `pdfjs-dist` and delivers `contentText` to `/complete`.
  2. Created `lib/pdf/extract.ts` as canonical extraction module interface.
  3. Built map proposal analysis and batch mutations in `lib/teacher/materialRouter.ts`: operations (`attach_material`, `add_kc`, `merge_into`) are atomically batched, creating a pre-mutation snapshot in `classes/{classId}/mapVersions` to allow complete rollback, and archiving merged nodes rather than destructively deleting them.
- **Rationale:** Delivers zero-config resilience for document ingestion across local and cloud environments, while ensuring non-destructive curriculum mutation with instant rollback capabilities.

## Decision 12: Resumable Background Jobs, Fail-Closed Quality Gates, and Publishing Invariants (B5-B9)
- **Context:** Large curriculum synthesis can encounter provider daily quota limits or network interruptions. Pedagogical quality checks previously failed open on upstream timeouts. Course publication allowed 0-KC shell publishing, which triggered student runtime errors.
- **Decision:**
  1. Implemented resumable background jobs in `buildClassWithAi` and added `POST /api/classes/[id]/build/[jobId]` enabling instant resumption of paused jobs using preserved input parameters.
  2. Changed `runPedagogicalQualityCheck` in `lib/teacher/qualityCheck.ts` to strictly fail closed (`passed: false`, `score: 0`) on upstream errors, requiring teacher manual verification before content can be published.
  3. Enforced course publishing invariants in `app/api/classes/[id]/publish/route.ts`: requires a minimum of 1 Knowledge Component (`EMPTY_COURSE` rejection) and validates DAG acyclicity (`CYCLE_DETECTED` rejection).
- **Rationale:** Prevents unverified or hallucinated educational content from leaking into active classrooms, prevents empty course shells from degrading student UX, and ensures robust recovery when external quota caps are encountered.

## Decision 13: Google Voice Lab Studio Audio & Elimination of Hardcoded Topic Fallbacks (B2, B10, Voice Lab)
- **Context:** The Notebook Deep Dive podcast previously relied on the browser's robotic `speechSynthesis` API, providing an underwhelming audio experience. In addition, student topic and syllabus pages fell back to hardcoded Ohm's Law mock documents whenever network delays or 404s occurred.
- **Decision:**
  1. Built `lib/ai/voice.ts` using Google Gemini Voice with persona allocation (`Alex` -> `Puck`, `Sam` -> `Fenrir`). Handled raw PCM byte streams by synthesizing a standard 44-byte RIFF/WAV header on the server, producing native browser-playable audio (`audio/wav`).
  2. Created `POST /api/notebook/voice` for audio synthesis with per-turn caching in the Notebook Deep Dive player, alongside seamless fallback to browser `speechSynthesis` if offline or on provider timeouts.
  3. Added `GET /api/classes/[id]/kcs/[kcId]` for direct KC retrieval and removed all hardcoded Ohm's Law mock fallback injections from `app/(app)/classes/[classId]/topics/[kcId]/page.tsx` and `app/(app)/classes/[classId]/syllabus/page.tsx`, rendering clean empty states with navigation links instead.
- **Rationale:** Delivers high-fidelity, studio-quality podcast learning dialogues powered by Gemini Voice while eliminating mock data leaks that masked real classroom data states.

## Decision: AI-Generated HTML5 Simulations, Verified Quizzes & Honest AI Errors
- **Context:** Fixed lab components only covered four physics topics; quizzes were short, rendered LaTeX as raw text, and sometimes marked the wrong option correct; any AI failure was reported as "daily limit reached"; AI class builds left topics as stubs with no live progress.
- **Decision:**
  1. Each topic can have an AI-written, self-contained HTML5 simulation (`lib/sim/*`, `/api/classes/[id]/kcs/[kcId]/simulation`). Output is sanitised (remote scripts/links/frames stripped), a strict CSP plus a small `window.synapta` bridge is injected, and it renders in `<iframe sandbox="allow-scripts">` (opaque origin). Mastery credit comes only from a server-graded check question stored next to the simulation; the iframe's "goal complete" message is cosmetic. Teachers can rebuild with instructions or auto-fix runtime errors; the first enrolled student to open a topic can trigger the initial build (Firestore lock prevents duplicates).
  2. Quizzes (`lib/quiz/normalize.ts`) require the model to state the answer text; the server reconciles it with the options, drops unverifiable/duplicate questions, strips "A)" labels and shuffles options. 5–15 questions, rendered with Markdown + KaTeX.
  3. `generateWithFallback` only raises `AI_QUOTA_EXHAUSTED` when quota was actually involved; bad output raises `AI_GENERATION_FAILED` (502) and invalid keys `AI_NOT_CONFIGURED` (503). JSON is recovered from fenced/prose-wrapped replies.
  4. Topics with stub lessons get a full lesson written on first open (`/api/classes/[id]/kcs/[kcId]/lesson`); quiz, flashcards, lessons and simulations share grounding from `lib/kc/context.ts` (lesson + the most relevant excerpts of the teacher's uploaded materials).

## Decision: Live Updates, Gamification, Community, Challenges & Sessions
- **Live updates** use tiny server-written signal docs (`liveChannels/{channel}`, `userSignals/{uid}`) that clients listen to with `onSnapshot`, then refetch through the authorised API. Data never becomes client-readable, and every page that matters (feed, leaderboards, challenges, sessions, notifications, XP) updates instantly.
- **Gamification** (`lib/game/*`) hangs off one `trackProgress()` call that runs after the mastery transaction: levels (50·n·(n−1) XP curve), 27 badges, 3 deterministic daily quests per learner (always one core learning quest; quest rewards don't feed other quests), and Duolingo-style weekly leagues (10 tiers, ~30-person cohorts, top 7 promoted, bottom 5 demoted in cohorts of 15+), settled lazily on a learner's first XP of the new week. Learners can hide from leaderboards and stop auto-sharing.
- **Community feed**: public and class posts (post/question/showcase + automatic achievement posts), likes, comments, moderation by authors/teachers/admins, rate limits.
- **Challenges**: teacher-created *quiz sprints* (AI questions verified with the quiz pipeline; Kahoot-style scoring: up to 1,000 points decaying to 500 at the limit, +100 per streak step capped at +500; question timing is server-stamped) and *hackathons* (submissions, one movable vote each, 24h voting window). Finalisation is transaction-guarded and awards XP, badges, notifications and feed posts once.
- **Study sessions**: scheduled per class by teachers or enrolled students, RSVP, a linked study room, notifications on schedule and 15 minutes before start (lazy + optional cron), +15 XP for attending.
- **Responsive shell**: phones get a 5-tab bottom bar with a "More" sheet; tablets an icon rail; laptops the full grouped sidebar. Verified at 390px, 820px and 1440px with no horizontal overflow.

## Decision: Shared Practice Banks, Audio Lessons, AI Recommendations
- **Token-usage bug**: `recordTokenUsage` read inside a transaction after writing, which Firestore rejects. Routes that awaited it (flashcards, syllabus, map, diagnostic) returned "Internal error"; the router swallowed it, so usage was never recorded. Reads now happen first (regression test in `lib/quota/guard.test.ts`).
- **Practice banks** (`lib/practice/*`): each topic gets a verified question bank (~60+, three parallel batches: conceptual / calculation / application) and a ~40-card flashcard deck, generated once and stored under `classes/{id}/kcs/{kcId}/practice`. Every learner's quiz/deck is drawn from it (unseen first, options reshuffled per learner) with no AI call. Teachers can prepare, extend or regenerate banks; quiz sprints on a class topic draw from the bank too.
- **Audio lessons** (`lib/lesson/audio.ts`): the AI writes a 12–18 turn teacher/student conversation; free Edge neural voices narrate it; MP3 per turn is stored once per topic (`kcs/{kcId}/audio/turn_{i}`) and streamed to every learner. Classes choose audio on/off and the lead voice at creation. Missing clips fall back to browser speech. The AI tutor's replies can be read aloud with the device voice.
- **Recommendations** (`lib/teacher/recommend.ts`): a class plan (outline + interactive activities + tips) derived from uploaded documents or the wizard's notes, saved on the class; and simulation concepts / improvements for a topic, usable in the simulation designer's build and edit modes.

## Decision: Social Platform, Messages, Saved Notebooks & Faster Audio
- **Models**: the default text tier is `gemini-3.5-flash-lite` (3.1 Flash-Lite is being retired) with `gemini-3.1-flash-lite` as fallback; heavy work stays on `gemini-3.6-flash` → `gemini-3.8-flash` → `gemini-flash-latest`.
- **Audio lessons** used to voice every turn before playback started. Now the script is written first (10–14 turns) and each turn is voiced just in time with an 8s timeout, cached for every later listener, with the next turn prefetched; a failed turn falls back to device speech and is retried after 10 minutes.
- **Feed** works like Facebook/X: five reactions, threaded comments (one reply level) with likes, exact timestamps, repost and quote, photos (max 4, compressed client-side, served only to signed-in users), polls, @mentions (notify), #hashtags with a 3-day weighted trending list, follow graph with a Following tab, public profiles at `/u/{username}`, bookmarks and global search.
- **Messages** (`chats/*`) replaced the old friends-only DM view: direct and group chats (≤50), read receipts, typing, reactions, unread badges, and rich attachments so posts, rooms, challenges, notebooks, badges and topics can be shared from one share sheet. Legacy `direct_chats` are imported on first open.
- **Notebooks**: Study Hub notebooks are saved per course (10 per course, 50 total, 20 sources each) with chat history and studio outputs. Owners share with friends as viewer/editor; the first share creates a linked group chat in Messages — the notebook's "room" — instead of a second chat system alongside Lounge. Members see each other's changes live via `notebook:{id}`.
- **Streak freezes**: one earned per 7-day streak (max 2), spent automatically on a missed day; optional daily reminder job.
- **Web push** via FCM (data-only messages, dead tokens pruned) mirrors in-app notifications and DMs when the user opts in.

## Decision: Tutor Without Function Calling, General Tutor, Opt-in Achievement Posts, Voice Timeouts
- **Tutor bug**: the tutor ran a multi-step Gemini function-calling loop and replayed tool calls without their thought signatures, which Gemini 3 models reject, so most questions failed. The tutor now loads lesson, objectives, mastery and open misconceptions on the server, puts them in the system prompt and answers in one call (faster, cheaper, no tool round trips). New misconceptions are flagged with a trailing `[[misconception: …]]` tag that is stripped and recorded. History is normalised to alternate user/model turns.
- **Tutor everywhere**: `/api/ai/tutor` accepts a topic, a class, or nothing (general study tutor for any subject). There is an AI Tutor page (`/tutor`) and a floating "Ask tutor" panel on every app page, which focuses on the class/topic you're viewing. Conversations are kept per context in the browser.
- **Achievements are opt-in**: level-ups, badges, mastered topics, league promotions and wins are offered as "Post to community / Not now" cards (with an optional caption) on the dashboard and feed. They're only posted automatically if the learner turns on "Auto-post achievements".
- **Voice**: the Edge TTS websocket can stall without erroring, so every synthesis is time-boxed. Gemini TTS moved from the retired `gemini-2.5-flash-preview-tts` to `gemini-3.8-flash-lite-tts` → `gemini-3.8-flash-tts` (Interactions API, legacy generateContent as fallback) and now also backs up audio lessons. The notebook podcast voices each line as you listen (one line prefetched) instead of synthesising the whole episode in one request.
- **Model safety net**: shut-down model IDs pinned in env vars or admin settings are replaced with current defaults, and the default light chain is always the last fallback. Admins can run a live **AI self-test** (Admin → System) covering tutor, JSON generation, heavy builds and both voice engines.

## Decision: Class Links Never Grant Access; Invite Links; Return-to-Link Sign-in
- **Bug**: any signed-in user with a link to a public class could open its lessons, quizzes, simulations, audio and tutor without enrolling (`canView` included "public & published"). The join code of every published class, private ones included, was also sent to anyone by the Explore API and readable through Firestore rules.
- **Access**: `computeClassAccess` (pure, unit-tested) — `canView` = teacher/co-teacher, admin or active enrollment only; `canPreview` = public & published (landing page with description and locked topic outline). Every class page is wrapped in a `ClassJoinGate` layout that shows Enroll (public), Request to join (private, notifies teachers) or Join with invite code. Firestore rules match (KCs readable only by members; private class docs only by members).
- **Invite links**: teachers copy `/classes/{id}?code=…`; a valid code admits the student immediately even to a private class. Join codes are only returned to the class's teachers and admins. Approvals/rejections notify the student; new requests notify the teachers.
- **Sign-in**: the proxy keeps the full link (path + query) in `?redirect=`; login and signup both return there (validated by `safeRedirect`: same-site paths only, never back to an auth page), and an already-signed-in visitor to /login goes straight to the target.

## Decision: Maker Studio — Simulate, Code, Test and Share Designs Without Parts
- **Designs are data, not generated HTML.** A design is validated JSON (`lib/studio/spec.ts`): 3D parts whose sizes/positions can be formulas of named parameters (`lib/studio/expr.ts`, a whitelist-only evaluator), a circuit (parts + wires + Arduino-style code), a gear-train mechanism, guided steps with automatic checks, and behaviour tests. One renderer draws everything, so AI and humans edit the same thing and every change is diffable.
- **Circuits** follow SunRoot's digital twin: a component catalog with pin roles, union-find nets, a simplified DC model (LED forward voltage, series resistance, pull-ups, drivers), and a checker that allows bad wiring but explains it (`message` with numbers, `why`, a Socratic `prompt`). Code runs in a sandboxed ES5 interpreter (JS-Interpreter) on a virtual clock, so shared designs can't touch the page or the viewer's account, and the same runtime powers live simulation, behaviour tests and server-side scoring.
- **Mechanisms** simulate motor/hand-crank → compound gear stages (real teeth/module/centre distance) → drum → pulleys → load with gravity and per-stage efficiency; the analytic optimum ratio is shown and confirmed by the time-stepped simulation (too little reduction stalls, too much is slow).
- **Git-style history**: every save is a commit with author, message, source (manual/AI/param/revert/fork) and a readable diff; commits are optimistic (a stale base gets 409), restore adds a new commit, forks keep credit, and per-person commit counts are shown. Collaborators (friends) edit live via `design:{id}` signals.
- **Learning**: guided steps are verified on the server before XP is awarded; learn/practice/challenge modes set hint depth (instruction → pointer → question, as in SunRoot's LearningModes); the tutor sees the live netlist, code, checker output, test results and physics numbers; YouTube videos per step (official API, cached, remembers the learner's preferred creator).
- **Classes**: topics get ordered "build labs" (template, teacher design, or AI-generated for the topic); students start their own copy and teachers see progress per lab. **Build challenges**: a fixed brief (load/height/input or the template's judge tests); entries are scored by re-running the simulators on the server with the brief locked, AI editing is disabled while live, and entries open up after the end. **Goal → path** turns the maker survey's ask into ordered stages with checklists, videos, a studio build per stage and a costed parts list.
- **Follow-ups (audit)**: Lounge rooms got a *Maker space* — one shared design (`designs.roomCode`) that every room member can edit, each commit credited to its author (`loadDesign` grants edit to the design's room members). Build labs with due dates also appear on the class **Assignments** page (`/api/classes/[id]/labs`) with per-student progress and teacher started/finished counts. Every class topic page now has a "Videos on this topic" card (YouTube search, cached).

## Decision: Distinct Hosts, Gapless Streaming Audio, Shared Voice Cache, Task→Model Matching
- **Same-voice bug**: the Gemini fallback gave both hosts male voices (Puck/Fenrir), and the device fallback only varied pitch slightly. Alex is now female and Sam male in every engine (Jenny/Guy, Kore/Puck, Rachel/Adam, and a female/male device voice pair chosen by name).
- **Loading**: the old queue loaded two lines before Play and one at a time after. `GaplessPlayer` (`lib/audio/gapless.ts`) fetches every remaining line greedily (3 in parallel, nearest-first) from the moment the script exists, decodes with the Web Audio API and schedules each line to start exactly when the previous ends (+0.14 s natural pause) — no gaps, no restarts; seek, pause/resume and speed changes re-lay the schedule; an unvoiceable line is read by the device voice at its place in the conversation.
- **Shared**: each voiced line is cached by host+text in `ttsCache` (chunked across documents when large), so a podcast is synthesised once for everyone; notebook scripts are saved with the notebook for members. Edge TTS has a circuit breaker (skipped for 10 min after two failures; `VOICE_ENGINE` override).
- **Models**: tasks map to groups (`TASK_GROUPS`) — build-type work (class builds, simulations, Maker Studio, assignments, grading) runs on the strongest model; chat, quizzes, flashcards, study guides, podcast scripts and research stay on the fast model with a light-only fallback chain so the small heavy quota is kept for where it matters. Previously Maker Studio and assignments started on the light model and only reached the strong one after a failure.
