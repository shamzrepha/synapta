# Technical debt register and roadmap (proposal)

Compiled from the ten audit files. Severity: Critical (other people's data or money at risk now), High (breaks a promise to users or leaks cost),
Medium, Low. "Blocks features" means new work built on top would inherit the problem. Everything here is a recommendation, nothing was changed.
Effort is rough engineer-days for an AI-assisted solo developer and is a guess. Source file named in brackets.

## Register

| # | Severity | Issue | Affected files / area | Impact | Recommended fix | Effort | Blocks features |
|---|---|---|---|---|---|---|---|
| 1 | Critical | Any signed-in user can become a teacher: create a school, then `register_members` themselves as teacher [FEATURE_INVENTORY part 2] | `app/api/schools/route.ts` | Teachers are uncapped on AI and can publish to students | Require admin approval or a verified school invite for the teacher role; rate-limit school creation | 1 | Yes (permissions) |
| 2 | Critical | `POST /api/lounge/match` returns enrollee emails and mastery for any class; rooms listable and auto-joinable by code [DB audit D2] | `app/api/lounge/*`, `app/(app)/lounge` | Private student data exposed | Class-access check, remove emails, opt-in matching, no auto-join on GET | 1-2 | Yes |
| 3 | Critical | No account deletion, data export, privacy/terms page, consent or age gate; data goes to Gemini, Groq, OpenRouter, Edge TTS, ElevenLabs [SECURITY] | whole app | NDPA exposure, trust | Legal review, pages, consent, delete/export endpoints (cascade) | 5-8 | No, but must precede growth |
| 4 | High | Past-question solver broken on every cache miss: `quiz_gen` called with no `schema` then requires `result.data` [AI audit; verified by me] | `app/api/classes/[id]/past-questions/route.ts` | A paid feature (Exam Pass) fails and still costs tokens | Pass a zod schema; add a test that does not mock the router | 0.5 | No |
| 5 | High | Pro plan lacks the solver (`hasExamAccess` allows plus, exam, teacher only) [BUSINESS] | `lib/billing/*` | A higher plan has less than a lower one | Fix the check; add a plan-matrix test | 0.5 | No |
| 6 | High | `studio_ai` and `class_build` plan limits never checked; with `BILLING_ENFORCED` unset no per-feature limit blocks anyone; teachers uncapped [AI, BUSINESS] | `lib/billing/*`, routes | Advertised limits are false; heavy teacher cost | Enforce or remove; decide production default | 2 | Yes (pricing) |
| 7 | High | AI-built topics have no `contentPublished`, so they are live in "follow" mode; "Take offline" does not hide practice; pieces and quests read the working copy [FEATURE_INVENTORY part 1] | `lib/classes/live.ts`, `buildClassWithAi`, `add_kc`, syllabus generate | Unreviewed AI content reaches students | Default AI-built topics to draft; one honest publish summary | 2-3 | Yes |
| 8 | High | Three AI gateways: Worlds and voice/STT bypass pause switch, per-user quota and the OpenRouter cap; `GET .../map`, `generateStructuredJson` routes call AI with no quota check [AI] | `lib/ai/structured/*`, `lib/ai/voice.ts`, `app/api/classes/[id]/map` | Uncapped spend | Route Worlds and TTS through one spend and pause layer; quota-check GET routes | 3-4 | Yes (cost) |
| 9 | High | Rate limiting mostly per instance; only 9 routes `shared: true`; ~117 mutating routes no route-level limit; `proxy.ts` limit bypassed by a fresh junk token per request; `auth/session` not shared contrary to DECISIONS.md [DB, SECURITY] | `lib/rateLimit.ts`, `proxy.ts` | Abuse and AI spend | Verify cookie before counting; shared limiter on costly routes; document single-server semantics | 2-3 | No |
| 10 | High | Mastery gameable; self-reported flashcard "known" counts as evidence; diagnostic can overwrite real mastery; `mastery` id lacks `classId` so two classes with the same topic slug share a doc [LEARNING, DB D3] | `lib/evidence/apply.ts`, `lib/bkt`, `mastery/{uid}_{kcId}` | The headline feature cannot be trusted | Item-level evidence, latency/confidence, caps, class-scoped ids (migration) | 5-8 | Yes |
| 11 | High | Provider API keys stored as plaintext in Firestore `secrets/*` [SECURITY] | `app/api/admin/system/*-key` | One leaked read exposes paid keys | Move to environment variables or encrypt (KMS) | 1-2 | No |
| 12 | High | `sunrootlearn.com` runs the migration branch build, not `main`; version shows "self-hosted"; health check checks nothing; no error tracking; crash-stuck jobs never recovered [MOBILE] | Coolify settings, Dockerfile, `app/api/health` | Fixes do not reach users; blind in production | Deploy `main`, pass the commit, real health check, Sentry or equivalent, resume job sweep | 2-3 | No |
| 13 | Medium | Push in the Android app is Web Push (no Capacitor push plugin) [MOBILE] | `sunroot-mobile`, `public/firebase-messaging-sw.js` | Notifications likely never arrive in the app | Add native push plugin or drop the claim | 3 | No |
| 14 | Medium | Misconception loop not closed (correct answers advance `general_kc_accuracy`); `kcMisconceptionCatalog` and `classSignals` exist only in rules [LEARNING] | `lib/misconceptions`, `lib/mistakes` | Promised remediation does not happen | Close the loop or hide the feature | 4-6 | Yes |
| 15 | Medium | FSRS never touches BKT; personal-deck cards lose `kcId`; no review log; `mastery.nextReviewAt` never set; `recommendedPath` never rendered [LEARNING] | `lib/fsrs`, `lib/flashcards`, map API | Spaced review and recommendations are not adaptive | Join review events to evidence; render next step | 4-6 | Yes |
| 16 | Medium | 13 of 31 AI task ids unused; admin overrides do nothing; assignment agent runs on the cheap shared task [AI] | `lib/ai/tasks.ts` | Misleading admin; quality on cheapest tier | Remove or wire up | 1 | No |
| 17 | Medium | Cost tracking understates spend (thinking tokens uncounted, Gemini prices used for every provider, no Gemini daily cap); Gemini price doubling 2027-01-01 [BUSINESS, AI] | `lib/ai/*`, `usage` | Wrong margins | Record provider cost per call; add Gemini daily cap | 2 | No |
| 18 | Medium | Only 22 of 338 routes tested; rules test checks a copy of the allow-list; no emulator, no Playwright; CI does not run `next build` [TEST] | `.github/workflows/ci.yml`, tests | Regressions reach production | Emulator rules tests; add build step; a handful of end-to-end journeys | 5-8 | No |
| 19 | Medium | Duplicate subsystems: five lab systems, two DM systems, two notebook APIs, Worlds vs Classes pipelines, tutors vs mentors [SYSTEM MAP] | many | Slows every change | Pick canonical, migrate, delete | 10+ | Yes |
| 20 | Medium | Repo bloat tracked against rules: `.agent/` 5,181 files (~120 MB), APKs, 82 MB pitch media; 8 env vars missing from `.env.example` [SYSTEM MAP] | repo root, public/ | Slow clones, large images, migration risk | Remove from git, document env vars | 1-2 | No |
| 21 | Medium | `requireUser` reads `users/{uid}` on every API request; client-only rendering; polling every 3 s in chat [SYSTEM MAP, MOBILE] | `lib/auth/requireUser.ts`, chat UI | Firestore cost and latency at scale | Short-lived role cache; real-time or backoff polling | 2-3 | No |
| 22 | Medium | Class deletion leaves orphan subcollections; TTL only partly configured; `errorLogs` field mismatch; `contentCache` has no composite index; `/api/media` serves any stored file to any signed-in user [DB, SECURITY] | Firestore, `app/api/media` | Storage growth, privacy | Cascade delete, TTL, index, ownership checks | 3 | No |
| 23 | Medium | CSP allows `unsafe-inline` and `unsafe-eval` [SECURITY] | `next.config.ts` | Weaker XSS defence | Nonces; tighten where possible | 2-4 | No |
| 24 | Low | TanStack Query and react-hook-form installed, never used; Synapta vs Sunroot naming debt; duplicate docs [SYSTEM MAP] | package.json, docs | Noise | Remove or adopt | 0.5 | No |
| 25 | Low | Hall check-in PIN derived from the clock in the browser; principal dashboard shows invented default readiness [FEATURE_INVENTORY part 2, schools audit] | schools UI | Meaningless attendance and readiness | Server-issued PIN; real data or blank | 1-2 | No |

## Proposed roadmap

### Next 7 days: stop the bleeding (items 1, 2, 4, 5, 12 and the cheap parts of 6, 7, 11)
- Close teacher self-promotion and the lounge leak; restrict `/api/media` and the private-class listing.
- Fix the past-question solver (add the schema and an unmocked test) and the Pro plan check.
- Deploy `main` to `sunrootlearn.com` with the commit number, a real health check and error tracking; merge the migration PR only after the reminder jobs are confirmed on the new server.
- Decide and write down what `BILLING_ENFORCED` means in production; set a Gemini daily cap.
- Move provider keys out of plaintext Firestore.

### Next 30 days: make the promises true
- Enforce or retire the advertised plan limits; collapse pricing to Free, Exam Pass and Semester (the research review's recommendation); measure usage per task to replace the estimates.
- Publishing safety: AI-built topics default to draft; honest publish summary; teacher review before students see AI drafts.
- Bring Worlds, TTS/STT and unmetered GET routes under one pause and spend layer; shared rate limiter on costly routes; fix the `proxy.ts` bypass.
- Privacy basics: privacy and terms pages, consent, account deletion and export; legal review for NDPA.
- Mastery trust: item-level evidence, confidence tap, repeat-attempt weighting, remove self-reported "known" as mastery; show the next best step; start recording pre/post and delayed checks.
- Test safety net: Firestore emulator rules tests, `next build` in CI, three end-to-end journeys (sign-up, join and study, lecturer publish).

### Next 90 days: earn the differentiator
- Close the lecturer loop: class weak-topic and misconception view, assignments with submissions, practice recommendations tied to published topics.
- Join FSRS and BKT (exam-date-aware spacing), predict-before-run in the HTML labs, deterministic Sprout reactions in quizzes and labs.
- Pick one lab system, one DM system and one notebook API; migrate and delete the rest; move APKs and media out of git.
- Low-data and offline reading mode; native push or remove the claim; reduce polling and heavy first-load bundles.
- Run a small learning-outcome study with two or three lecturers; use it to price Semester and school plans.

Not recommended now: a rewrite, more game or social features, new AI task types, or per-student AI chatbots for Sprout.
