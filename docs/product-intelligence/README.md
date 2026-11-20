# SunRootLearn: product intelligence audit (read-only discovery)

Date of the audit: 2026-11-19 (repository state: `origin/main` at commit `e3eb258`, plus Antigravity's open branch `ops/migrate-to-own-server`).
Method: ten reviewers each read a slice of the repository and wrote one file; this index and the executive summary were written afterwards by
combining their reports. Nothing was changed in the product, nothing was run against production, and no AI provider was called.
Only plain GET requests to the public site were made (for the mobile and infrastructure review).

**What this audit is not.** It has no production data: no real user counts, spend, conversion, retention or learning outcomes exist in the
repository, so every cost figure is an estimate on stated assumptions and every scale statement is a hypothesis. Where something could not be
verified, the files say so. Confidence levels are HIGH (read in code), MEDIUM, LOW, UNKNOWN.

## Files

| File | What it is |
|---|---|
| `CHATGPT_HANDOFF.md` | **Start here for another AI.** Self-contained briefing: verified architecture, features, routes, collections, AI tasks, engines, rules, limits. |
| `SUNROOT_SYSTEM_MAP.md` | Architecture map with diagrams, directory tree, 338 API routes by domain, duplicates, strengths, weaknesses. |
| `FEATURE_INVENTORY.md` | Feature by feature: status, files, routes, collections, AI tasks, permissions, publishing, gaps. Plus lecturer and student journeys. |
| `AI_INFRASTRUCTURE_AUDIT.md` | Three AI gateways, task registry, routing, caching, retries, cost model, routing matrix. |
| `LEARNING_ENGINE_AUDIT.md` | BKT, FSRS, evidence, misconceptions, learner DNA, the learning loop, what is missing for real adaptivity. |
| `DATABASE_AND_API_AUDIT.md` | Collections, rules, indexes, data flows, API security matrix, rate limits, quotas. |
| `BUSINESS_AND_UNIT_ECONOMICS.md` | Plans, billing implementation, unit economics, risks, access-model recommendations. |
| `MOBILE_AND_INFRASTRUCTURE_AUDIT.md` | Android thin shell, offline, low-data, Docker/Coolify/Hetzner/Cloudflare, reliability. |
| `SECURITY_AND_PRIVACY_AUDIT.md` | Security findings, tenant isolation, AI-generated HTML, privacy, NDPA points. |
| `TEST_AND_QUALITY_AUDIT.md` | What CI enforces, test coverage by area, high-risk gaps, debt input. |
| `PRODUCT_AND_LEARNING_SCIENCE_REVIEW.md` | Honest product assessment, competitor comparison, learning-science research with sources. |
| `TECHNICAL_DEBT_AND_ROADMAP.md` | Prioritised debt register and 7, 30 and 90 day proposals. |
| `OPEN_QUESTIONS.md` | Everything the repository cannot answer, with who can answer. |
| `FOUNDER_QUESTIONNAIRE.md` | Questions only the founder can answer, in priority order. |

## Executive summary

**1. Overall technical health: fair, with sharp edges.** The foundations are better than most startups at this size: one auth gate, a uniform API
envelope, CI rules that fail the build for unguarded routes and hard-coded model names, 232 test files, a decision log. But there are 338 routes
and about 165 Firestore collection names in a codebase written fast by AI coding agents, with duplicate subsystems, several verified
access-control holes, and tests that mock the things most likely to break (only 22 of 338 routes have a route test; no emulator, no browser tests).
CI does not run `next build`.

**2. Overall product health: a strong core idea buried under too many features.** The differentiator the code supports is the lecturer-published
class feeding a student mastery loop in the Nigerian semester context. Generic AI notes, flashcards and podcasts are commodities. Roughly five lab
systems, two chat systems, two notebook systems, nine pricing tiers and a social network compete with that core for attention and for engineering time.

**3. Learning-engine maturity: a skeleton, not an adaptive system.** BKT runs on default parameters and drives only topic choice; the computed
next-activity path is returned by the map API but never shown; review timing is never set; FSRS and BKT do not talk to each other; mastery is
gameable (three correct answers reach 98%, a random clicker reaches 95% in about 50 items; a self-reported flashcard "known" counts as
evidence); the misconception loop does not close; nothing measures learning (no pre/post, delayed or transfer tests).

**4. AI architecture maturity: moderate, with cost and control gaps.** The central router with task ids and fallback chains is a good design,
and the OpenRouter daily cap now exists, but there are three gateways, not one: Worlds and the voice/transcription code bypass the pause switch,
per-user quota and the spend cap. 13 of 31 task ids are never called. Fallbacks drop images (Groq) and search tools (OpenRouter). One user-facing
feature, the Exam Pass past-question solver, is broken on every cache miss (verified by reading the code and the router).

**5. Financial sustainability: unproven and fragile.** No real usage data exists. On the reviewers' explicit assumptions an average Plus student
costs about N850 a month and Pro about N1,826; Pro on the 4-month price is about break-even at the token cap; school seats at N1,200 cover only
free-level AI; teacher plans can lose money at heavy use. The advertised `studio_ai` and `class_build` limits are never enforced, `BILLING_ENFORCED`
unset means per-feature limits block nobody, and Gemini 3.6/3.8 Flash prices double on 2027-01-01. The biggest cost is teacher-side building, not
student chat (a full 20-topic class is roughly $6 to $8 now).

**6. Security assessment: needs urgent attention in a few places, solid in others.** Strong: AI-generated HTML is well sandboxed, the Paystack
webhook is sound, Firestore rules default to deny and the client touches Firestore in only three places. Serious: any signed-in user can become a
teacher by creating a school and registering themselves; `POST /api/lounge/match` returns emails, XP and mastery for any class; AI provider keys
sit as plaintext in Firestore; there is no account deletion, data export, privacy page or consent, while student data goes to five external
providers (Nigerian NDPA review needed); the `proxy.ts` rate limit can be bypassed with a fresh junk token per request.

**7. Mobile readiness: a working thin shell with little offline value.** The app loads the live site; push in the Android app is Web Push and almost
certainly does not work inside a WebView; offline study barely exists; the heaviest transfers are the 8.9 MB APK, the Firebase and PDF-worker
bundles, 3-second chat polling and base64 audio.

**8. Top ten risks**
1. Teacher self-promotion and the lounge data leak (other people's data is exposed now).
2. No account deletion, consent or privacy page while sending student data to five providers (legal exposure).
3. AI-built topics are live to students immediately (no `contentPublished`); AI drafts can reach students unreviewed.
4. Cost leaks outside the cap: Worlds, TTS, `GET /api/classes/[id]/map`, quiz/flashcard banks billed to the class teacher.
5. Plan limits that are advertised but not enforced; teachers uncapped while billing is off.
6. Mastery that can be gamed, so the headline differentiator cannot yet be trusted.
7. Single Hetzner server as a single point of failure; `sunrootlearn.com` currently running a branch build, not `main`; health check checks nothing; no error tracking.
8. Scope sprawl and duplicated subsystems slowing every change; no browser tests.
9. Gemini price doubling on 2027-01-01 and an unverified free-tier dependency for production.
10. Provider keys in plaintext Firestore; `unsafe-inline` and `unsafe-eval` in the CSP.

**9. Top ten opportunities**
1. Make the mastery loop trustworthy (answer-level evidence, confidence tap, speed, repeat-attempt weighting) and show the "next best step".
2. Lecturer weak-topic and misconception view (data largely exists, the loop does not close).
3. Exam-date-aware spaced review joined to mastery (cheap fit).
4. Predict-before-run in labs (cheap fit with the existing HTML lab path).
5. Deterministic Sprout reactions to practice events (no chatbot cost).
6. Collapse pricing to Free, Exam Pass and Semester and make limits real.
7. Cache and share AI output per class and topic so student cost stays near zero.
8. A low-data mode and an offline reading mode that does not rebuild the app.
9. Measure learning (pre/post and delayed checks) so there is evidence to sell to lecturers and schools.
10. Delete or merge duplicate systems and remove tracked bloat (`.agent`, APKs, pitch media).

**10. Five things to fix before adding major features**
1. Access control: teacher self-promotion, `lounge/match`, open study rooms, `GET /api/classes` exposing private classes, `/api/media` open to every signed-in user.
2. Billing truth: enforce the advertised limits or stop advertising them; fix `hasExamAccess` (Pro cannot use the solver); decide what `BILLING_ENFORCED` unset means in production.
3. Fix the broken past-question solver and put Worlds, TTS and the unmetered GET routes under the same pause switch, quota and spend cap.
4. Publishing safety: write `contentPublished` for AI-built topics and make "Publish Class" honest about what it pushes.
5. Privacy basics and deployment truth: privacy and terms pages, consent, account deletion and export, encrypt or move provider keys; deploy `main` to `sunrootlearn.com` with the real commit number, a real health check and error tracking.

Read `TECHNICAL_DEBT_AND_ROADMAP.md` for the sequenced plan.
