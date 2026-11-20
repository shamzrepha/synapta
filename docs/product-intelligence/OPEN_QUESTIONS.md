# Open questions: everything the repository cannot answer

Collected from the "Open questions" section at the end of each audit file. Each item says what is missing, why it matters, who can answer
(the founder, someone with production access, or an external check) and what evidence would settle it. Where a source file marks the owner of the
question, that mark is kept. Items are NOT yet de-duplicated across files: the same gap can appear under two headings.

How to use this file: questions marked founder need a decision or a fact from you; questions marked production need someone with access to
Firebase, Coolify, Cloudflare, Paystack or the Google Cloud console; questions marked external need a check outside the code (law, prices,
competitors).


## System map

| # | What is missing | Why it matters | Who can answer | Evidence that resolves it |
|---|---|---|---|---|
| 1 | Production traffic: active users, requests/day, reads/writes per day per collection | All 10k-student statements are hypotheses; sizing of Hetzner box and Firestore bill | Founder / production access (Firebase usage, Vercel analytics) | Firebase console usage tab, Vercel analytics export |
| 2 | Which lab systems and which routes are actually used (classic labs, `/experiments`, Studio, Worlds, communities, mentors vs tutors) | Decides what to delete; section 5 is code-only | Founder / production access | Firestore counts per collection, request logs per route |
| 3 | Is Worlds intended to replace the Classes pipeline? | Determines duplicate-pipeline severity | Founder | Product decision, `docs/worlds/*` (not read by me) |
| 4 | Which DM system (`chats` vs `direct_chats`/`messages`) and which notebook API (`notebook/*` vs `notebooks/*`) is canonical | Data migration and cleanup | Founder / DB-API slice | Client call sites and live collection contents |
| 5 | Contents of `.github/workflows/{deploy-firestore,security-review}.yml` and whether CI runs `next build` | Deploy safety | Repo reading by another slice | Full workflow files |
| 6 | Firestore region and Storage bucket existence in production | Latency from Hetzner, and whether `media/` images live in Storage or Firestore docs | Production access (Firebase console) | Project settings |
| 7 | Role "principal" implementation | Authorization model for schools | Security/business slices, founder | `app/api/schools/route.ts`, rules for school collections |
| 8 | Behaviour of `x-forwarded-for` and Origin/Host through Cloudflare + Coolify (Traefik) | Rate limiter keying and the cross-site check (`Host` header must equal the public host) can break after migration | Whoever deploys (external test) | A test deployment on `test.sunrootlearn.com` |
| 9 | Purpose and schedule of `jobs/resume` and of `scripts/acceptance-b14.ts` | Part of the `verify` gate and cron migration | Repo reading by another slice | Read both files |
| 10 | Whether sentry/upstash/PostHog were ever intended or are used outside this repo (e.g. Vercel integrations) | Brief lists them; code has none | Founder | Vercel integrations page, `SENTRY_DSN` in Vercel env |
| 11 | Real accessibility and offline quality | Only signals were checked | External testing | Lighthouse/axe run, device tests |
| 12 | Whether `.agent/` and the APKs were intentionally force-added | Contradicts CLAUDE.md | Founder | Commit history for those paths |


## Feature inventory

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


## AI infrastructure

1. Is the production Gemini key on the free tier or paid tier? This changes cost ($0 versus the table), data-use terms, and whether the 20 and 500 RPD caps in `KNOWN_MODELS` are real constraints.
2. Is `BILLING_ENFORCED=1` (or `config/billing` mode all/testers) on in production? If not, teachers are uncapped and plan limits are not applied.
3. Real usage numbers: DAU, tutor turns per user, builds per teacher, ratio of sims to topics. Needed to replace every assumption in section 4.
4. Actual `thoughtsTokenCount` for Gemini 3.x calls (not set anywhere); could double output cost.
5. Current OpenRouter prices and existence of every id in `OR_CLASS_INFO` (run `npm run check:openrouter` with network access); Groq llama prices ("Contact Sales" on the docs page).
6. Is the active provider currently `gemini`, `groq` or `openrouter` (`secrets/ai_provider`)? If Groq, vision features are broken today.
7. Is `ELEVENLABS_API_KEY` set in production, and does Edge TTS work from Vercel's region?
8. Does Firestore have TTL policies on `rateLimits.purgeAt`, `quotaReservations.purgeAt`, `aiCache` (none found for the latter) and `ttsCache`? Firestore database location and unit prices for the real project.
9. Is the past-question solver failing in production (section 0.2)? Check logs for `AI_GENERATION_FAILED` on `pastq` and the cache hit ratio.
10. Is the sim iframe sandboxed (no same-origin) given that model-authored HTML/JS runs in students' browsers? Outside this slice.
11. Is there any scheduler that resumes `waiting_quota` class builds after `resumeAt`?
12. Legal/commercial status of the unofficial Edge TTS client for a paid product.
13. Which of `gemini-flash-latest`, `gemini-3.7-flash`, `gemini-3.8-live`, `gemma-4-*` really exist for the project's key (this audit could only confirm the models listed in 1.8; the pricing page was read to character 100,000 of 117,969).


## Learning engine

1. Does `lib/teacher/classBuilder.ts` generate `bkt` per KC with anything other than defaults, and can teachers edit them in the UI? (Only `kcStore.ts` was read.)
2. Does the reader's "Close the book" recall step call any server evidence route, or is it purely client-side routing? (Not traced; assumed no BKT evidence.)
3. Which AI tasks are in `PERSONALIZED_AI_TASKS` (list only partially read), and what do provider data-processing terms and consent cover for learner profile data, especially for minors?
4. Is `/api/evidence` called from any client besides the topic page, and how often do learners hit the 30 per day cap? (Needs production data; not available to this audit.)
5. How are quiz question quality and `distractorMisconceptions` validated (`lib/quiz/normalize.ts`, `lib/teacher/qualityCheck.ts` were only skimmed by name)?
6. Should the Worlds mastery rule (stability >= 21, 3 successes, 2 templates) become the model for topic mastery? (Comparison not done.)
7. Is there exam or assignment grade data (`lib/exam`, `assignments`) usable as an external outcome to validate pL against? (Not read in depth.)
8. Production Firestore state: how many junk `general_kc_accuracy` docs exist, and is `nextReviewAt` populated anywhere? (Cannot be checked read-only from the repo.)
9. `docs/design/LEARNING-LOOP.md` cites literature "from memory, not re-checked"; the references above were also not re-fetched. Someone should verify them before any external claim.


## Database and API

1. Are Firestore TTL policies actually enabled in production for `rateLimits.purgeAt` and `quotaReservations.purgeAt`, and is any set for `errorLogs.expireAt`? Not visible from the repo.
2. Does production Firestore already hold an auto-created composite index for `contentCache (classId, createdAt)`? If not, `GET /api/classes/[id]/content` fails today.
3. Does production run on Vercel serverless (per-instance limiters) or the self-host Docker image (single process)? This decides the real value of the in-memory limiters.
4. Does `trackProgress` or `recordAdaptiveSignal` need to finish after the response (serverless freezing risk)?
5. How are provider API keys in `secrets` and `systemConfig` stored (plain or encrypted)? Not inspected; no values were read.
6. Do the leaderboard, `friends` and `users/search` honour the "hide from leaderboards" flag consistently?
7. Do KC documents contain teacher-only fields (draft lessons, lab answers) that enrolled students can read via the SDK under the `kcs` rule?
8. The brief mentions principal checks, but `requireUser` has no `principal` role. Where is school/principal authorization enforced (`app/api/schools/*`, `lib/schools`)? Not audited in depth.
9. Is there any intended admin tooling (scripts, Console) to delete users or classes outside the API? None found in the repo.
10. Should `studentCount` be re-derived with a `count()` aggregate on `enrollments`, given no removal or decrement path was found?


## Business and unit economics

1. Is `BILLING_ENFORCED` / `config/billing` off in production, and are Paystack payments live? (Decides whether F2 hurts real customers.)
2. Which model actually serves each task in production (Gemini, OpenRouter, Groq), on a paid or free Gemini key?
3. Is production on Vercel or the Hetzner CX23 self-host? Vercel costs are not in these numbers.
4. How does a school invoice become entitlements (which accounts hold the `school` plan; are seats pooled)?
5. How many holders of retired `promax`/`ultra` or admin-granted plans exist, and at what cost?
6. Real token cost of a class build, `grade_handwritten`, `sim_build` and podcast generation (call graphs not traced).
7. Real conversion, activity, retention and renewal rates (none available).
8. Stamp duty and chargeback fee treatment by Paystack at these amounts; FX leakage when paying the AI bill in USD.
9. What is the published refund policy and who handles disputes?
10. Are thinking tokens enabled by default on the configured Gemini models (affects the undercount)?


## Mobile and infrastructure

1. What `server.url` and `allowNavigation` list does the installed APK (3.3 and 3.5) use: vercel.app, sunrootlearn.com, or both?
2. Did the native project remove the "continuous cache" layer and implement `offline.html`, `onReceivedError`, back button, file chooser and microphone permission, as the briefs ask?
3. Is push implemented natively in the app (FCM plugin), or only via web push (which would not work in a WebView)?
4. Is `sunrootlearn.com` built from `ops/migrate-to-own-server`, as the manifest suggests? Which commit exactly (need the Coolify build log or a working `SOURCE_COMMIT`)?
5. Do the Coolify scheduled tasks for streak and goal reminders exist and run? When did they last succeed? Are the Vercel crons still firing too?
6. Does a downloaded notebook actually open in airplane mode on a real phone, signed in? What does the page do with `/api/me` offline?
7. Is Firestore offline persistence enabled in `lib/firebase/client.ts`?
8. Does the Gemini voice path return PCM/WAV or MP3 in production, and what is the actual size per minute?
9. Are notebook uploads compressed client-side?
10. What is the Hetzner server size and location, the actual peak build memory, and has the 4 GB build been repeated successfully?
11. Is there any backup beyond Hetzner snapshots (Firestore export), an uptime monitor, and a log retention policy?
12. Is Cloudflare SSL set to Full (strict), and are origin ports restricted to Cloudflare ranges?
13. Is the Paystack webhook already pointed at `sunrootlearn.com`, and has a live payment been verified there?
14. Is the Firebase browser API key referrer list updated for `sunrootlearn.com`, and is the domain in Authorized domains?
15. Is a Play Store listing in progress, so updates can be silent?


## Security and privacy

1. Which Gemini/Groq/OpenRouter plans are in use, do they train on inputs, are DPAs signed?
2. Are students under 18 on the platform (secondary school pilots)? Who is controller vs processor for school-sponsored accounts?
3. Does `/api/media` hold only post/explainer media? Who may see it across schools?
4. Are Firestore TTL policies enabled in the console (`purgeAt`, `errorLogs.expireAt`)?
5. What fields does a public class document carry (`joinCode`, teacher email)?
6. About 30 dynamic routes (feed, events, communities, tutors, polls) not read for IDOR.
7. How are the APKs signed and where is the signing key kept?
8. Is Sentry configured with PII scrubbing; who can read Vercel logs and for how long?
9. What does `lib/documents/office.ts` parse, and is it bounded against zip bombs?
10. Is `SEARXNG_URL` set in production?


## Test and quality

1. Is branch protection requiring the CI check before Vercel production deploys?
2. Do `lib/ai/router.test.ts` cases cover the DNA/cache isolation rule and quota-exhaustion across all provider tiers?
3. Is there any coverage figure or flaky-test history? (Not in repo.)
4. Are `scripts/smoke.ts` and `scripts/eval-tutor.ts` run anywhere on a schedule?
5. Which of the 22 route tests assert negative authorization (wrong user, wrong role), not just success paths? Only file names were checked.
6. Is a Dependabot or Renovate config present outside the tracked files read?
7. Does `next build` pass on `main` today? It was not run.


## Product and learning science

1. Do BKT and FSRS share any state for a student? Is there one question bank or four? (Needs the engine audit.)
2. What proportion of AI-generated quiz items and past-question solutions are correct? Is there a measured error rate? (`qualityCheck.ts` exists; no results seen.)
3. Is the tutor hint ladder actually enforced, and do logs show whether students attempt before asking? 
4. Are BKT parameters ever fitted? What do pL values look like on real classes? Are there any real classes with real student data at all?
5. What is real willingness to pay, and what do Nigerian students actually spend on exam prep? I found no verified data.
6. Is `BILLING_ENFORCED` on in production, and how does Paystack conversion look? (Not available to me.)
7. Which institutions are using it, and are lecturers or students driving adoption? Any data-protection posture under Nigeria's NDPA 2023 (not researched)?
8. Exact current competitor prices (Duolingo, Brilliant, Quizlet, NotebookLM, Moodle, uLesson): re-verify on official pages; my fetch tool could not read them.
9. Actual offline behaviour on low-end Android (cold start, cache eviction, sync conflicts): untested by me; I did not run anything.
10. Evidence on gamification and on Nigerian-university-specific AI study products: I did not retrieve meta-analyses or a full market scan in this session.
11. Which sections of the product have child-safety or minors' data exposure (messages, feed, communities)?
