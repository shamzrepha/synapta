# SunRootLearn: briefing for a long-term product architect and research partner

You are joining as product architect and research partner for SunRootLearn. This file is self-contained. It was written from a read-only audit of
the repository on 2026-11-19 (state: `origin/main` commit `e3eb258`). Treat it as authoritative where marked VERIFIED, and as a hypothesis where
marked HYPOTHESIS. The ten detailed audit files sit next to this one; ask the founder to paste a section when you need depth. Never invent
files, routes, collections or numbers: if something is not here, say ASSUMPTION and ask.

## 1. What it is
Web app plus an Android thin shell for university students (Nigeria first). Lecturers build and publish classes (AI helps); students read, listen,
practise, take labs and are tracked by a mastery engine. Founder: Udeakpu Yahnomnso Shamaryah. Mostly written by AI coding agents (Claude Code,
Antigravity). Live at https://sunrootlearn.com (Cloudflare in front of a Hetzner CX23 4 GB server running Coolify/Docker). At audit time that site ran
Antigravity's branch `ops/migrate-to-own-server`, not `main`; `https://sunrootlearn.vercel.app` still builds `main`. Firebase Auth and Firestore are
external and unchanged. Android shell (separate project `sunroot-mobile`, not in this repo, not audited) loads the live site and updates through GitHub
Releases and `public/app-version.json`.

## 2. Verified architecture
- Single Next.js 16.4.3 app (App Router, React 19.3, TypeScript, Tailwind 4), npm, Node 24. About 155k lines: 338 API route files, 102 pages, 353 lib modules,
  197 components, 232 test files. Almost everything is client-rendered. `proxy.ts` (not middleware) only checks a session cookie exists, redirects, caps body
  size and does a cross-site write check plus a per-instance write rate limit.
- Auth: Firebase Auth (email and Google), session cookie, role in custom claims and mirrored in `users/{uid}.role` (student, teacher, admin; principal and school
  features exist). `lib/auth/requireUser.ts` is the single gate and reads `users/{uid}` on every API request.
- Data: Firestore only, via firebase-admin on the server. About 165 collection names in code; `firestore.rules` declares about 28; everything else is
  denied to clients. The client uses the Firestore SDK in only three places (study-room page, realtime user signals, live channels).
- API envelope `{ok,data}|{ok:false,error:{code,message,requestId}}` (`lib/api/errors.ts`). Routes: `requireUser`, zod validation, `checkRateLimit`. CI test
  `app/api/route-guards.test.ts` fails if a route lacks a guard (regex presence check, not semantic).
- CI (`npm run verify`): tsc, eslint (0 errors), vitest, `check:guards` (list maps use `asArray`), `check:models` (no hard-coded Gemini ids outside `lib/ai`),
  acceptance script. CI does not run `next build`. Dev rules in `CLAUDE.md`.
- Hosting files: `Dockerfile` (standalone output when `SELF_HOST=1`), `docs/SELF-HOSTING.md`, scheduled jobs by `curl` with `CRON_SECRET`
  (`/api/jobs/streak-reminders`, `/api/goals/reminders`, optional `/api/jobs/session-reminders`). `/api/version` reports "self-hosted" on the new server
  (no commit passed), so the new-version banner cannot fire there. `/api/health` checks nothing.
- Libraries: firebase 13, firebase-admin 14.5, @google/genai, zustand (one store), katex, mermaid (installed, never rendered), three, blockly, pdfjs-dist 6.4,
  ts-fsrs, framer-motion, edge-tts-universal. TanStack Query and react-hook-form are installed but unused. No Sentry, PostHog or Upstash code exists.

## 3. Roles and publishing (VERIFIED)
Lecturer builds a class (`classes/{id}` with topics `kcs/{kcId}`), uploads materials, generates lessons, banks, quests, sims, audio, then publishes per kind
(lesson, audio, simulation, practice) through `contentPublished` with a live mode per topic (`lib/classes/live.ts`: `liveMode`, `draftOf`, `pushToStudents`).
Gap: AI-built topics (`buildClassWithAi`, `add_kc`, syllabus generate) set no `contentPublished`, so they are live; "Take offline" does not hide practice.
Students join by code (`enrollments/{classId}_{uid}`).

## 4. Main API domains (counts of route files)
Classes 55 (core: join, roster, materials, syllabus/generate, build, map, heatmap, assignments, past-questions, per-topic lesson/practice/simulation/quests/
pieces/audio/publish), Studio 30, Admin 30, Study tools 15, Worlds 14, Social feed 10, Events 9, Communities/groups/friends/chats ~21, Lounge and focus 11,
Sessions/attendance/announcements 15, Notebooks 10 (two systems), Tutors/mentors/ask 15, Billing 4 (`checkout`, `verify`, `webhook`, `me`), AI direct 3
(`ai/tutor`, `ai/quiz`, `ai/flashcards`) plus `stt`, `tts`, `tts/read`, Auth 3, Jobs 4, Infra (`health`, `version`, `media`, `avatar`), plus about 60 singletons
(`schools`, `snap`, `quiz/[sessionId]/answer`, `evidence`, `papers`, `leaderboard`, `shop`, `documents/read`, `referrals`, `profile/setup`...).
Public routes (allow-list): `health`, `version`, `client-errors`, `auth/session`, `auth/bootstrap`, `auth/restore`, `billing/webhook`, plus cron routes using the secret.

## 5. Firestore collections that matter
`users`, `classes`, `classes/{c}/kcs` (topics; `contentPublished`, `bkt`), `kcs/*/{audio,quests,practice,pieces,simulations,glossary}`, `materials`, `enrollments`,
`mastery/{uid}_{kcId}` (no classId in the id: two classes with the same topic slug share a doc), `evidence` (append-only, fastest growing), `quizSessions` (holds
answer keys), `learnerProfiles`, `misconceptions`, `learnerPlans` (daily, no TTL), `contentCache`, `aiCache` (no TTL), `studyNotes`, flashcards
(`flashcardDecks`, `flashcards`, `users/{uid}/cards`), `usage/{uid}_{yyyy-mm}`, `quotaReservations`, `rateLimits`, `aiSpend/{date}`, `payments/{reference}`,
`systemConfig` and `secrets` (admin provider keys, PLAINTEXT), `posts`, `communities`, `rooms` (study lounge), `chats` and `direct_chats`, `schools`, `worlds`,
`media` and `avatars` (images stored as base64 inside docs). `kcMisconceptionCatalog` and `classSignals` appear only in the rules. Rules default to deny.

## 6. AI layer (VERIFIED)
- Main gateway `generateWithFallback` (`lib/ai/router.ts`, about 1,200 lines): kill switch `aiPaused`, per-user token reservation, language directive, optional
  learner-DNA injection (never with a cache key), provider order Gemini chain then OpenRouter then Groq (admin can switch the primary), at most 2 OpenRouter models
  per call, daily OpenRouter dollar cap (`systemConfig/orBudget`, default $1.50, spend in `aiSpend`). Schema output is parsed only when a `schema` is passed
  (`result.data` is undefined otherwise: this is the cause of the broken past-question solver).
- Two more gateways bypass the pause switch, quota and cap: Worlds (`lib/ai/structured`, config `config/ai`) and direct voice/STT (`lib/ai/voice.ts`, Groq Whisper).
- Task ids in `lib/ai/tasks.ts` (31): used (about 18): `tutor_chat`, `structured_spec` (catch-all JSON), `class_build`, `sim_build`, `studio_build`, `lesson_notes`,
  `study_guide`, `explain_selection`, `quiz_gen`, `card_gen`, `grading_high_stakes`, `student_evaluation`, `long_document`, `research_answer`, `notebook_mindmap`,
  `discussion_script`, `quest_build`. Never called (admin overrides do nothing): `material_route`, `assignment_architect`, `assignment_author`, `assignment_reviewer`,
  `notebook_chat`, `notebook_artifacts`, `source_guide`, `paper_analysis`, `flashcard_gen`, `research_plan`, `class_study_guide`, `embedding`, `transcribe`, `voice_tts`.
- Gemini chains: light tasks flash-lite models, heavy (build, grading) flash models; OpenRouter chain per job class (`lib/ai/openrouter-models.ts`); Groq fallback
  drops images, OpenRouter fallback drops search tools. Only one call site uses `cacheKey` (studio ideas). Model names must never be hard-coded outside `lib/ai`.
- Voice: Edge TTS (free, unofficial client), OpenRouter TTS, ElevenLabs optional; the reader voice is Edge `en-US-AnaNeural` at +45Hz through `/api/tts/read`.
- Cost (ESTIMATES, not measured): tutor turn about $0.0035; a full 20-topic class build about $6 to $8; teacher-side building dominates. Gemini 3.6/3.8 Flash prices
  double on 2027-01-01. No production usage data exists.

## 7. Learning engines (VERIFIED, `LEARNING_ENGINE_AUDIT.md`)
BKT per topic from `applyEvidence` (`lib/evidence/apply.ts`): default parameters, drives topic choice only; `recommendedPath` is computed but never rendered; review
timing (`nextReviewAt`) never set. Gameable: three correct answers reach 0.98; self-reported flashcard "known" counts; diagnostic can overwrite mastery; no latency,
item-id or confidence use. FSRS (`ts-fsrs`) is separate from BKT; personal cards lose `kcId`; no review log. Misconception loop does not close. Learner DNA
fields mismatch `applyEvidence`. Nothing measures learning (no pre/post, delayed or transfer). Documented loop: goal, attempt, feedback, adjust
(`docs/design/LEARNING-LOOP.md`); not built: predict-before-run, interleaving, hint fading, declarative animated lessons.

## 8. Features and their state (summary; detail in `FEATURE_INVENTORY.md`)
Working or mostly working: class build and publish, interactive reader with KaTeX and Sprout read-along (page turns, word follow), HTML simulation labs (default
lab path; SimKit3D), Studio circuit bench with a physics checker, quizzes, flashcards, tutor, streaks and XP, schools, Paystack billing. Broken or illusory: past-question
solver (no schema), Content Review screen (nothing serves approved items), `mermaid` (never rendered), plan limits for `studio_ai` and `class_build` (never checked), principal
readiness (invented defaults), study lounge isolation, hall PIN (clock-derived in browser). Duplicates: five lab systems, `chats` vs `direct_chats`, `notebook/*` vs `notebooks/*`,
Worlds vs Classes pipelines, tutors vs mentors.

## 9. Business rules (VERIFIED in `lib/billing/plans.ts`)
Plans (naira): Free; Exam Pass 1,500/month or 5,000/term; Plus 3,500 or 11,000; Pro 6,000 or 19,000; Pro Max and Ultra retired (still honoured); Teacher 7,500 or 20,000;
Teacher Pro 15,000 or 40,000; School 1,200 per seat per term, by invoice. `TERM_DAYS` = 135, `MONTH_DAYS` = 30. Paystack checkout/verify/webhook with signature, amount and
idempotency checks (sound); no recurring billing, refund, dispute or cancellation handling; buying a different plan forfeits remaining days. Per-feature monthly limits exist
for notes, scanned pages, lessons, practice; `BILLING_ENFORCED` unset means they block nobody (a flat 50k-token cap and 10 calls a minute still apply to students; teachers uncapped).
Bug: `hasExamAccess` excludes Pro. Referral rewards (250 XP; 10 referrals give an Exam Pass) need a verified email.

## 10. Security and privacy (see `SECURITY_AND_PRIVACY_AUDIT.md`)
Strong: AI-generated HTML runs in a sandboxed iframe without same-origin with a meta CSP and a message-source check; Paystack webhook; deny-by-default rules. Open (VERIFIED by
reading): any signed-in user can become a teacher (create school, register self); `POST /api/lounge/match` leaks emails and mastery; `GET /api/classes` and `/api/media`
over-share; provider keys in plaintext Firestore; `proxy.ts` rate limit bypassable with a fresh junk token; CSP has `unsafe-inline` and `unsafe-eval`; no account deletion,
export, privacy page, consent or age gate; student data goes to Gemini, Groq, OpenRouter, Edge TTS, ElevenLabs. NDPA 2023 needs legal review.

## 11. Performance, mobile and operations
Likely 10k-student problems (HYPOTHESES): `requireUser` read per request, shared Firestore rate-limit hot keys, single server, synchronous heavy generation, big uploads in memory.
Mobile: thin shell; Web Push probably dead in the WebView; offline barely exists; heavy transfers: 8.9 MB APK, Firebase and PDF-worker bundles, 3-second chat polling, base64 audio.
Operations: one Hetzner server, no staging, no APM, health check empty, stuck jobs not recovered.

## 12. Principles for any recommendation
1. Extend existing engines before adding new ones: lecturer-published classes, `kcs`, `evidence`/`mastery`, the HTML lab path, `generateWithFallback` tasks.
2. Every AI feature must be a task in `lib/ai/tasks.ts`, behind `requireUser`, zod-validated, rate-limited, quota-checked, cached when shared, and inside the spend cap.
3. Cost per active student must stay near zero for free users: cache per class and topic, use the cheap model class, avoid per-student generation.
4. Evidence over engagement: any new feature needs a measure of learning, not only time spent.
5. Low data, cheap phones, naira prices, semester rhythm (about 4.5 months), lecturer-led adoption.
6. Prefer deleting duplicates to adding variants.

## 13. Do not reinvent
The AI router and task registry, the route-guard and model-name CI checks, `applyEvidence`, `ts-fsrs` integration, the publish gating in `lib/classes/live.ts`, the reader
and Sprout follow logic (`components/lesson/*`), the sandboxed lab host (`lib/sim/inject.ts`, `components/labs/*`), Paystack billing, the Studio circuit checker.

## 14. Verify in the repository before you recommend a change
Anything touching: `mastery` ids (migration), publish gating, plan limits and `BILLING_ENFORCED`, rate limiting (`lib/rateLimit.ts` vs shared counters), the three AI gateways,
`firestore.rules` and indexes, school and role logic in `app/api/schools`, anything in the Android shell (not available to the audit), and deployment (what Coolify actually runs).
Ask the founder to paste the exact files; never guess.

## 15. Where to go next
`README.md` (executive summary), `TECHNICAL_DEBT_AND_ROADMAP.md` (sequenced work), `OPEN_QUESTIONS.md`, `FOUNDER_QUESTIONNAIRE.md`. Ask the founder the questionnaire's first
section before proposing a roadmap.
