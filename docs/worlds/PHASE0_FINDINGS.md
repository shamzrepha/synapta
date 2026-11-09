# SunRoot Worlds: Phase 0 findings

Written before any Worlds code, as required by spec section 3 (`SUNROOT_WORLDS_SPEC.md`, kept next to this file together with the owner's brief `CLAUDE_CODE_PROMPT.md`).
Every statement below comes from inspecting this repository, not from assumption. Items I could not verify are listed in section 12.

## 1. Which SunRoot is this?

Neither of the two forms in the owner's notes. It is the **Synapta-based platform, now branded SunRoot / SunrootLearn**, a Next.js App Router app on Vercel with Firebase and **both Gemini and Groq** behind an admin toggle. It is not the vanilla TypeScript + Vite app and it has no `/api/ask` proxy.

| Item | Finding |
| --- | --- |
| Framework | Next.js 16.4 (App Router, `proxy.ts` instead of middleware), React 19.3, TypeScript 5, Tailwind CSS 4 |
| Package manager | npm (`package-lock.json`); `engines.node >= 24.12` (the sandbox I work in has Node 22, which builds and tests fine) |
| Lint / types / tests | `eslint` 9 (0 errors, ~34 warnings baseline), `tsc --noEmit`, `vitest` 5 (152 files, ~1,011 tests). Single gate: `npm run verify` = tsc + eslint + vitest + `check:guards` + `check:models` + `test:acceptance` |
| CI | `.github/workflows/ci.yml` (verify), `security-review.yml`, `deploy-firestore.yml` (deploys rules + indexes) |
| Hosting | Vercel (`main` auto-deploys); `vercel.json` has two crons only |
| Key libraries already installed | `firebase` 13, `firebase-admin` 14, `zod` 3.25, `ts-fsrs` 5.4, `pdfjs-dist` 6.4, `@google/genai`, `three`, `zustand`, `react-markdown` + KaTeX, `lucide-react`, `canvas-confetti` |
| Not installed | `firebase-tools` (no emulator CLI), any docx library (see section 6), any rules-unit-testing package |
| Project rules | `CLAUDE.md`: AI work goes through `lib/ai/tasks.ts` + `generateWithFallback`; no hardcoded Gemini model names outside `lib/ai` (CI `check:models` fails it); API routes use `requireUser` + zod + rate limits, enforced by `app/api/route-guards.test.ts`; secrets only in `.env.local` / Vercel; design system in `docs/design/DESIGN-SYSTEM.md` |

## 2. Routing and the closest pages to copy

- App Router with route groups: `app/(marketing)` (landing), `app/(app)` (signed-in shell: sidebar, top bar, phone bottom bar, global Add-material sheet, Ctrl/Cmd+K palette). Nav is defined in `components/shell/nav-items.ts`; features and intent groups in `lib/features/registry.ts` and `lib/features/intents.ts`.
- Closest existing pages for structure:
  - **`app/(app)/notebook/page.tsx`**: upload sources (pdf, docx, images, text), read them, generate study artifacts. This is the nearest thing to the Worlds upload flow.
  - **`app/(app)/classes/[classId]/page.tsx`** + **`components/classes/learning-map.tsx`**: the quest-style map with a "where next" recommendation. The World map should reuse its path rendering and mastery encoding.
  - **`app/(app)/classes/[classId]/topics/[kcId]/page.tsx`** with **`components/labs/pieces-lab.tsx`** and **`components/quest/quest-runner.tsx`**: the "piece by piece" topic page and the full-screen one-task-at-a-time runner (choose, number, slider, order, match, sort; misses return; server-graded). Several Worlds activity templates (`mcq`, `ordering`, `matching`, `classify`) are the same interaction as the Quest widgets and should reuse them.

## 3. Existing AI plumbing

- **`lib/ai/router.ts`** (~1,000 lines): `generateWithFallback`, `executeStructuredAiTask` (zod-validated JSON), error classification, quota-exhausted handling. Task keys live in `lib/ai/tasks.ts`; task-to-tier groups in `lib/ai/models.ts` (`TASK_GROUPS`: structured, longdoc, build, grading, voice...).
- **Providers**: Gemini via `@google/genai`; Groq via `lib/ai/groq.ts` (OpenAI-style HTTP, dynamic model list in `groq-models.ts`). The active provider is an admin toggle stored in `secrets/ai_provider` (the Groq key is stored there too, never sent to the browser).
- **Model assignment today**: `systemConfig/aiModels` (admin-set per-task overrides, cached 10 s) falling back to environment variables `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MODEL_{TUTOR,STRUCTURED,LONGDOC,BUILD,GRADING,VOICE}`, `GEMINI_CHAIN_{LIGHT,HEAVY}`, `GEMINI_MODEL_OVERFLOW`, `GEMINI_MODEL_FALLBACK`, `GEMINI_RPD_LIMITS`, and then a built-in `KNOWN_MODELS` registry in `lib/ai/models.ts`. The admin UI for the provider and key is `components/admin/ai-key.tsx` (APIs `app/api/admin/system/ai-provider`, `groq-key`, `models`), shown on the admin pages under `app/(app)/admin`.
- **Vision/OCR**: `lib/documents/pages.ts` (`pageNeedsVision`, `READ_SYSTEM`, `splitVisionAnswer`, `cleanVisionText`, `VISION_BATCH = 3`, `MAX_VISION_PAGES = 60`) sends page images to the AI to read scans and handwriting. It returns plain text, with **no per-line confidence**.
- **Per-user quota**: `lib/quota/guard.ts` (`checkRateLimitAndQuota`), plan limits in `lib/billing`, an admin "plan limits" switch (currently Off; `BILLING_ENFORCED` unset).
- **Guard rails that matter here**: `scripts/check-no-hardcoded-models.mjs` forbids Gemini model literals and direct `generateContent` calls outside `lib/ai/**`; `lib/ai/scrub.ts` sanitises untrusted text before it goes into prompts.

## 4. Firebase

- **Access pattern**: almost every read and write goes through API routes using the Admin SDK. `firestore.rules` (239 lines) is **default-deny** with narrow client reads (users, classes, kcs, enrollments, mastery, evidence, sources, rooms, notifications...). There is a client SDK (`clientDb()`) used for tiny live listeners.
- **Real time today** (R19): the server writes small "signal" docs (`userSignals/{uid}`, `liveChannels/{channel}`, see `lib/live/server.ts`); the client's `realtime-provider` listens to its own signal doc and refetches. Direct client listeners on job/world documents will need new rules (spec 15.2).
- **Collections in use** (most used first): users, classes, kcs, messages, designs, posts, entries, enrollments, rooms, mastery, comments, materials, friends, studySessions, members, studyGroups, leagueEntries, polls, notebooks, sources, evidence, buildJobs (under classes), aiCache, contentCache, config, secrets, systemConfig, usage, quotaReservations, rateLimits, userSignals, liveChannels...
- **Name collisions with the spec**: checked `jobs`, `worlds`, `sourceDocs`, `knowledge`, `reports`, `cards`, `progress`, `reviewLogs`. **None exist**, so the spec's collection names can be used as written. `config/` already holds `site` and `billing`, so `config/ai` is free. `bugReports` exists separately from the spec's `reports`.
- **Indexes**: `firestore.indexes.json` has 24 composite indexes (posts, designs, leagueEntries, classes, enrollments, events, evidence, bugReports, auditLogs, studySessions, chats, notebooks). Deployed by `deploy-firestore.yml` on merge.
- **Emulator**: Java is installed but `firebase-tools` is not; installing it from npm should be possible, but it has not been tried (section 12).

## 5. Existing gamification and memory

- **XP / levels / streaks / badges / leagues / quests**: `lib/game/*` and `lib/streak*`, `lib/quests/*`. The central entry point is `lib/game/progress.ts` (a progress event with `xpToAward`, stats, quest hooks, league and weekly XP, notifications, social share). Learning XP normally arrives through `lib/evidence/apply.ts` (`applyEvidence`), which updates **BKT mastery per class topic (KC)**, XP and streak in one transaction, but **only for an active student of a class** (and limits "lab" evidence to one per topic per 10 minutes).
- **FSRS**: `ts-fsrs` is installed and wrapped in `lib/fsrs/scheduler.ts` (`createNewFsrsCard`, `scheduleCardReview`, `parseRating`, `isCardDue`). Flashcards store an FSRS card on each card (`lib/cards/types.ts`, `lib/flashcards/*`). The Worlds memory engine (spec 16) should reuse this wrapper and add the queue builder, interleaving and mastery on top.
- **Mastery encoding in the UI**: blue lightness + hatched orange + number (colour-blind safe), already used by the heatmap and the Learning Map. Reuse it for the World map.

## 6. Existing document upload and study material

- **Notebook** (`app/(app)/notebook`, `lib/notebook/*`, `lib/notebooks/store.ts`): sources with extracted text, retrieval, studio artifacts (flashcards, quiz, mind map, source guide).
- **Class materials** (`app/api/classes/[id]/materials`): stores `extractedText` and chunks; teachers' uploads feed the class builder (`lib/teacher/classBuilder.ts`, `materialIngest.ts`, `materialRouter.ts`), which already "routes" new material into an existing class map.
- **File reading**: PDFs in the browser with `pdfjs-dist` (`lib/pdf/extractor.ts`, falls back to vision when the text layer is empty); **Word/PowerPoint in the browser with no library** (`lib/documents/office.ts` unzips the OOXML itself using `DecompressionStream`); server-side PDF parsing in `lib/teacher/materialIngest.ts`; image compression in `lib/image-compress.ts`; photo limits in `lib/snap/image.ts`.
- **Gaps against the spec**: no structure-aware docx extraction (headings, lists, tables are flattened), no per-line OCR confidence, no cleanup rules (junk glyphs, chat boilerplate, symbol repair), no source anchors (page and line), no outline editor. All of S0 and S1 is new work; the existing readers are the starting point.

## 7. Serverless limits

Routes in this repo already declare `maxDuration` of 30 (4 routes), 60 (20), 90 (8), 120 (21) and **300 (7, simulation and class builds)**, and these have run in production, so the current Vercel plan allows at least 300 s. I will still design each `/api/worlds/advance` invocation as one bounded unit of work well under **60 s** (spec 17.1) and set `maxDuration = 120` as a ceiling. Bounded fan-out of 3 to 5 model calls. Prompt and Subject Pack files read at runtime need `outputFileTracingIncludes` in `next.config.ts` so they ship with the serverless bundle (new work, easy to miss).

## 8. How the spec maps onto this repo

| Spec says | In this repo |
| --- | --- |
| `src/ai/` | `lib/ai/` (new files `structured.ts`, `adapters/*`, `config.ts`; allowed to name models by the CI guard) |
| `generateStructured()` | New, **beside** `generateWithFallback`, not replacing it. Existing features keep working untouched |
| `config/ai` admin doc (models registry, routes, tiers) | New doc; separate from `systemConfig/aiModels`. Server-read only |
| Provider adapters | OpenAI-compatible adapter (reuses the Groq HTTP path) + Gemini adapter (reuses `@google/genai`) |
| `/prompts/<name>.vN.md`, `/subject-packs/*.json`, `/fixtures/worlds/` | Repo root folders as specified |
| `POST /api/worlds/advance` | `app/api/worlds/advance/route.ts` (+ upload, review, report, review-queue routes), each with `requireUser`, zod and rate limits where they cost money |
| UI components list (WorldMap, ActivityShell...) | `components/worlds/*`; pages under `app/(app)/worlds/*`; add to nav and feature registry |
| Memory engine in `src/memory/` | `lib/worlds/memory/*` wrapping `lib/fsrs/scheduler.ts` |
| Activity renderers | New components; `mcq`, `ordering`, `matching`, `classify` reuse the Quest runner's widgets |

## 9. Conflicts and decisions

| # | Spec | Repo reality | Decision (default I will follow unless told otherwise) |
| --- | --- | --- | --- |
| C1 | **R6: dark mode only, never a light theme** | The whole app has light and dark, and the owner explicitly asked for both earlier | **Needs the owner's answer.** Default: the Worlds area always renders in the dark palette (scoped), the rest of the app keeps its theme. No new light theme is added anywhere |
| C2 | R10/R11: one `generateStructured()` gateway; no model names anywhere but config | Existing router, env defaults and a built-in model registry; project rule says use `generateWithFallback` | Build the gateway on top of the existing providers; Worlds refuses to start when a route is empty (no silent env fallbacks); existing features are left alone. `check:models` already allows model names inside `lib/ai/**` only |
| C3 | R13: no app-side AI quota for teachers creating classes | `checkRateLimitAndQuota` and plan limits exist | Worlds jobs skip the per-user token quota and use a concurrency queue instead. The route still has `requireUser` + a basic abuse rate limit so `route-guards.test.ts` passes. Note: provider-side free-tier limits (for example the small daily caps on strong Gemini models) are outside the app's control |
| C4 | Spec 16/15: FSRS card per KU per world; XP via existing gamification | `applyEvidence` needs a class and an enrolled student | Personal worlds have no class. Default: card state under `users/{uid}/cards`; XP through `lib/game/progress.ts` (`xpToAward`) directly. For class-scoped worlds, optionally also call `applyEvidence` per class topic later |
| C5 | R19: Firestore listeners | Reads are mostly API plus signal docs | Add rules so the owner can read their own `jobs`, `sourceDocs`, `worlds` docs directly and listen with `onSnapshot`; writes stay server-side |
| C6 | Section 19.1: golden fixtures from the owner's real files | **The files are not in the repo or the session** (a Word note on dyspnoea; 12 handwritten gastrostomy pages) | I will write synthetic fixtures from the facts listed in the spec so tests can run now, and **the owner must drop the real files into `fixtures/worlds/`** before Phase 2/3 acceptance can be called passed |
| C7 | Brief: owner runs git and deployments, Windows/Git Bash, edit "my project folder" | This session runs in a cloud container; work is lost unless pushed | I commit and push to the session's feature branch only (never open PRs or merge unless asked), so the owner can pull it. Commands in my reports use bash syntax |
| C8 | R7 disclaimer, R5 moderation | No social surface in v1 of Worlds; existing bug-report queue (`bugReports`) | Disclaimer shown for medical/nursing/law packs; "Report a problem" writes to the new `reports` collection with an admin queue (spec 8). No social features added |
| C9 | S0 wants confidence per OCR line | Current vision reader returns text only | New OCR prompt returns lines with confidence (spec S0); existing reader untouched |
| C10 | Server-side docx reading | Existing reader is browser-only and flattens structure | Add a small Node docx reader (same unzip approach, structure-preserving) rather than a new dependency, unless a library is justified; decide in Phase 2 |

## 10. Risks

1. **OCR quality of handwriting** depends entirely on the configured vision model; the confidence flags and Review Gate 1 are the safety net. Cannot be judged without the real pages (C6).
2. **Provider variety**: a tiny model may fail the strict JSON schemas; mitigated by tier batching and the repair loop, but only the Model Conformance Test (Phase 8) proves it.
3. **Cost and time**: a full world is many model calls. Rule-based passes first, hash caching, bounded fan-out, queueing instead of refusing (R13). Free-tier providers may throttle large uploads.
4. **Firestore rules and indexes are easy to get wrong silently**; every new compound query gets its index in the same change, and the rules need emulator tests (blocked until `firebase-tools` is installed, section 12).
5. **Prompt files in serverless bundles**: must be traced (section 7).
6. **Scope**: the spec is large (9 stages, 17 templates, 9 packs). I will follow the phases strictly and not start a phase before the previous one's checks pass.
7. **Overlap with existing features** (Notebook artifacts, class builder, Quests): Worlds must reuse them where possible and not duplicate, per the brief.

## 11. Proposed order of work (unchanged from spec section 20)

Phase 1 AI gateway + admin config → 2 ingestion + Review Gate 1 → 3 knowledge extraction + conflicts → 4 activities and renderers → 5 world and lecture loop → 6 memory engine and Ward Round → 7 more Subject Packs → 8 tutor, merge, teacher tools, conformance → 9 hardening. Each phase ends with type-check, lint, tests, a production build and a short summary.

## 12. What I could not verify in Phase 0

- The real fixtures (C6) and therefore any statement about OCR or extraction quality on them.
- The Vercel plan's actual limit (inferred from routes that already run at 300 s).
- Whether `firebase-tools` can be installed and the emulator started in this environment (Java is present).
- A production build (`next build`) has not been run in this session; the usual gate (`tsc`, `eslint`, `vitest`, guards) passes on `main`.
- Which providers and models the owner will assign in `config/ai` (none will be assumed, R10).

## 13. Question for the owner (one, with a recommended default)

**C1: dark mode.** The spec says Worlds must be dark only, but the rest of SunRoot has a light mode you asked for earlier. Recommended default: **Worlds screens are always dark; everything else keeps light and dark.** Alternative: Worlds follows the app's light/dark choice (this breaks R6). Everything else above I have decided with a default and will follow it unless you object.
