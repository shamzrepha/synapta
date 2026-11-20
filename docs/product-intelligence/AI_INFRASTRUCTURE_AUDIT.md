# AI Infrastructure and FinOps Audit (SunRootLearn / Sunroot)

Scope: read-only audit of `lib/ai/**`, `lib/quota`, `lib/rateLimit.ts`, `lib/adaptive/learner-dna.ts` and every caller of `generateWithFallback`, `executeStructuredAiTask`, `generateStructured`, `generateStructuredJson`. Nothing was executed: no provider call, no build, no test run. Audit date 2026-11-19. Statuses: Verified (read in code), Partially verified, Assumption, Unknown. Line numbers are deliberately omitted; function and file names are exact.

Measured vs estimated: nothing in this document is measured from production. Token counts are ESTIMATES derived from prompt text size (about 4 characters per token) and `maxOutputTokens` values in code. Provider prices come from the pages named in section 4.1. No usage, revenue or traffic figures were available; where they matter, a measurement plan is given.

---

## 0. Executive summary (blunt)

1. **There is not one AI gateway, there are three.** The main router (`generateWithFallback`), the "Worlds" gateway (`lib/ai/structured/generate.ts`, own config doc `config/ai`, own adapters) and direct provider code in `voice.ts` / `groq.ts` (TTS, STT). Only the first has the kill switch (`aiPaused`), per-user token reservation and the OpenRouter daily dollar cap. Worlds and TTS bypass all three. (Verified.)
2. **The Exam Pass past-question solver is broken on every cache miss.** `app/api/classes/[id]/past-questions/route.ts` (solve path, task `quiz_gen`) calls `generateWithFallback` with NO `schema`, then does `if (!result.data) throw 502`. `data` is only populated when a schema is passed, so the call is paid for and then always rejected. (Verified by reading, not executed. Confidence HIGH.)
3. **Advertised plan limits for Maker Studio builds (`studio_ai`) and AI class builds (`class_build`) are not enforced anywhere.** `checkFeature` is called only for `notes`, `practice`, `scan_pages`, `lessons`. Only a per-minute rate limit (in-memory, per serverless instance) and the token budget apply. Teachers are uncapped on tokens while billing enforcement is off (`budgetOf`: `uncapped = teacher && !enforced`). (Verified.)
4. **13 of 31 task ids in `lib/ai/tasks.ts` are never used by any caller.** Admin per-task model assignments for them do nothing. Callers use the generic `structured_spec` instead (assignment agent, material router, notebook artifacts, podcast discussion). (Verified by grep.)
5. **Vision fallbacks lose the image.** `callGroqChat` flattens `contents` to text and drops `inlineData` parts. If Groq is the active provider or the emergency fallback, `/api/documents/read` and `/api/snap` ask the model to "transcribe these images" without images and accept the result. `viaOpenRouter` also drops `tools`, so "web-grounded" research silently becomes ungrounded. (Verified.)
6. **Cost is dominated by teacher-side build work, not student chat.** Estimated: one tutor turn about $0.0035; one fully built 20-topic class (lessons, banks, quests, sim pieces, podcast scripts) about $6 to $7 at today's Gemini prices, 55 to 60 percent of it simulations. Gemini 3.6/3.8 Flash prices double on 2027-01-01 (section 4.1).
7. **The design appears tuned to the Gemini free tier** (`KNOWN_MODELS` RPD 500 for flash-lite, 20 for flash). If production is on the free tier, student content may be used by Google to improve products and capacity caps near 1,000 light calls per day. Tier of the production key: Unknown.

---

## 1. Architecture and routing map

### 1.1 The three gateways

| Gateway | Entry | Used by | Per-user quota | aiPaused | OpenRouter $ cap | Admin config |
|---|---|---|---|---|---|---|
| Main router | `generateWithFallback` (`lib/ai/router.ts`); wrappers `executeStructuredAiTask`, `generateStructuredJson` (`lib/gemini/client.ts`) | ~45 call sites in `app/` and `lib/` | Yes when `userId` passed (`reserveQuota`/`settleQuota`/`releaseQuota`) | Yes (only when `userId` passed) | Yes, per OpenRouter call (`overDailyCap`) | `systemConfig/aiModels`, `groqModels`, `openrouterModels`, `orBudget`; `secrets/ai_provider` |
| Worlds gateway | `generateStructured` (`lib/ai/structured/generate.ts`) | `lib/worlds/{ingest,extract,audit,tutor}.ts`, `app/api/admin/worlds/ai/test` | None (no `userId` in options) | No | No: `openAiCompatibleAdapter` never calls `recordSpend` | `config/ai` (models, per-task `routes`, limits); keys in `secrets/aiProviders` |
| Direct voice/STT | `synthesizeSpeech`, `synthesizeEdgeVoice`, `synthesizeGeminiTts`, `synthesizeOpenRouterSpeech`, ElevenLabs `fetch`, `transcribeAudioWithGroq` | `app/api/tts`, `app/api/tts/read`, `app/api/stt`, podcast recording (`lib/ai/host-voice.ts`, `lib/lesson/audio.ts`) | None (rate limit only) | No | No (OpenRouter TTS spend not recorded) | `voice-config.ts` pref; env `ELEVENLABS_API_KEY` |

Finding: "all AI calls go through the router" is FALSE. Status Verified. Direct provider SDK/fetch code exists only inside `lib/ai/**` plus the shared client constructor `lib/gemini/client.ts`; `scripts/check-no-hardcoded-models.mjs` enforces that for Gemini model ids and `generateContent`. So "no provider calls outside lib/ai" holds (grep for `@google/genai`, `generativelanguage`, `openrouter.ai`, `api.groq.com`, `elevenlabs` found nothing in `app/` or other `lib/` dirs). Impact: cost controls have three holes. Recommendation: give Worlds and TTS an actor id, route them through the same `aiPaused` check and one spend ledger (`aiSpend`); at minimum call `recordSpend` in the OpenAI-compatible adapter and in `synthesizeOpenRouterSpeech`.

### 1.2 Main router request lifecycle

1. No `userId` -> inner call, no kill switch, no quota (system jobs). `generateStructuredJson` (used by `app/api/classes/[id]/diagnostic/start`, `map`, `syllabus/generate`) never passes a `userId`, so those three routes bypass the kill switch and the token reservation unless the route checks itself. Status: Verified for the wrapper; per-route checks Partially verified.
2. `getSiteConfig().aiPaused` -> 503 `AI_PAUSED`.
3. Language directive appended (`withLearnerLanguage`) unless `learnerLanguage:false`; any `cacheKey` gets `:lang=xx`.
4. Learner DNA injection (`shouldInjectLearnerDna`): only for tutor_chat, explain_selection, notebook_chat, student_evaluation, paper_analysis, research_answer, study_guide, lesson_notes, assignment_reviewer; never with `cacheKey`, `learnerLanguage:false`, `isPrivileged`, or `personalize:false`.
5. `reserveQuota` (Firestore transaction) with `estimatedTokens ?? (heavy ? 8000 : 1500)`.
6. Inner: refresh keys; optional `CallBudget` (only `materialIngest` uses it; `class_build` budget helper exists but no caller); `aiCache` lookup if `cacheKey`; provider switch: `secrets/ai_provider` = `openrouter` -> `viaOpenRouter` first then Gemini chain; = `groq` -> `callGroqChat` first then Gemini chain; = `gemini` (default) -> Gemini chain, with OpenRouter then Groq if the client cannot initialise.
7. Gemini chain (`getChainForTask`): light tasks `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`; heavy tasks (groups `build`, `grading`) `gemini-3.6-flash`, `gemini-3.8-flash`, `gemini-flash-latest`, then the two light models. Per model up to `maxRetriesPerModel+1` = 3 attempts (tutor: 2). A schema mismatch retries the SAME model.
8. After the chain: emergency OpenRouter (max 2 models), then Groq.
9. All failed: `AiQuotaExhaustedError` (429, only if a quota problem was seen) else `AiGenerationError` (502). Reservation released on any throw.
10. Settle: actual `tokensIn + tokensOut` (defaults 500/600 if the provider returns no usage metadata). A cache hit releases the reservation.

### 1.3 Environment variable NAMES (values never read)

Gemini: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MODEL_TUTOR`, `GEMINI_MODEL_STRUCTURED`, `GEMINI_MODEL_LONGDOC`, `GEMINI_MODEL_BUILD`, `GEMINI_MODEL_GRADING`, `GEMINI_MODEL_VOICE`, `GEMINI_MODEL_FALLBACK`, `GEMINI_MODEL_OVERFLOW`, `GEMINI_CHAIN_LIGHT`, `GEMINI_CHAIN_HEAVY`, `GEMINI_FALLBACK_CHAIN`, `GEMINI_RPD_LIMITS`, `GEMINI_RPM_<MODEL>`. Groq: `GROQ_API_KEY`. OpenRouter: `OPENROUTER_API_KEY`. Voice: `ELEVENLABS_API_KEY`. Limits: `STUDENT_TOKEN_LIMIT` (default 50000), `TEACHER_TOKEN_LIMIT` (default 200000), `BILLING_ENFORCED`. Admin-saved keys in Firestore (`secrets/gemini`, `secrets/groq`, `secrets/openrouter`, `secrets/aiProviders`) override env.

### 1.4 Admin-configurable assignments (Firestore)

| Doc | Controls | Cache |
|---|---|---|
| `systemConfig/aiModels` | per-task Gemini model (key = task id) and `fallbackChain` | 10 s per instance |
| `systemConfig/groqModels` | per-task Groq model | 10 s |
| `systemConfig/openrouterModels` | per-task or `class:<cls>` OpenRouter model, put first | 10 s |
| `systemConfig/orBudget` | `dailyCapUsd` (default 1.5; 0 turns OpenRouter off) | 30 s |
| `aiSpend/<UTC day>` | `total`, `calls`, `tokensIn/Out`, `byModel`, `byTask` | 15 s |
| `secrets/ai_provider` | active provider gemini/groq/openrouter | 60 s |
| `config/ai` | Worlds models and routes | 10 s |
| `config/billing` | enforcement off/testers/all | 10 s |
| site config | `aiPaused`, `aiPausedMessage` | `getSiteConfig` |

Note: 10-second caches are per serverless instance; an admin change is not instant across instances.

### 1.5 OpenRouter daily spend cap, evaluated

- Default $1.50 per UTC day (`DEFAULT_DAILY_CAP_USD`), checked before EACH OpenRouter model attempt (`overDailyCap`).
- Spend is recorded after the response (`void recordSpend`, fire and forget) from OpenRouter's real `usage.cost` when present, else $3 / $15 per M tokens (deliberately high).
- Weaknesses (Verified): (a) not atomic: N concurrent calls all pass the check before any spend lands, overshoot = concurrency x call cost; (b) `todayCache` is per instance (15 s); (c) calls billed upstream but returning no `usage` (timeouts) are not counted; (d) TTS and Worlds OpenRouter traffic is not counted; (e) there is NO dollar cap on Gemini paid tier or ElevenLabs. Impact: the one dollar control covers the smallest spender.
- Recommendation: one global daily USD cap across all providers (token counts x price table), reserved before the call in `generateWithFallback`.

### 1.6 OpenRouter class map (`openrouter-models.ts`; `viaOpenRouter` slices chain to 2)

| Class | Chain | Tasks mapped |
|---|---|---|
| bulk | deepseek/deepseek-v4-flash, anthropic/claude-haiku-5.5, z-ai/glm-5.3-flash | default for every unmapped task (quiz_gen, card_gen, lesson_notes, study_guide, structured_spec, explain_selection, ...) |
| vision | claude-haiku-5.5, qwen/qwen3.7-plus, meta-llama/llama-4-scout | Worlds `ingest_vision` only |
| long | claude-haiku-5.5, deepseek-v4-flash, qwen3.7-plus | long_document, paper_analysis |
| heavy | deepseek/deepseek-v4-pro, claude-sonnet-5.5, qwen3.7-plus | class_build, assignment_architect/reviewer, research_plan, research_answer |
| grading | claude-sonnet-5.5, deepseek-v4-pro, qwen/qwen3.8-max-0902 | grading_high_stakes, student_evaluation |
| code | qwen/qwen3-coder, deepseek-v4-flash, claude-sonnet-5.5, deepseek-v4-pro | sim_build, studio_build, quest_build |
| chat | deepseek-v4-flash, claude-haiku-5.5, openai/gpt-oss-120b | tutor_chat, notebook_chat |

Findings: (1) `/api/documents/read` (task `long_document`) and `/api/snap` (`tutor_chat`) send images, but `viaOpenRouter` has no vision capability check and the first model of the `chat` class may not accept images (Partially verified; capability is external). (2) `reasoningEffort` is `medium` for heavy/grading, `low` otherwise; hidden reasoning tokens are still billed. (3) Outside the `code` class (16,000 default) there is no `max_tokens`, so an OpenRouter model may emit its provider maximum unless the caller set `maxOutputTokens` (only sim, lesson and piece builds do). (4) `quest_build` is mapped to the dearest-to-fail `code` class, a pure JSON task.

### 1.7 Groq

`mapToGroqModel`: `llama-3.3-70b-versatile` for heavy, `llama-3.1-8b-instant` for light unless the admin assigns. `pickGroqModels` asks Groq which models the key can use and tries up to 4. STT is `whisper-large-v3-turbo` in `transcribeAudioWithGroq` (`app/api/stt`, rate limit only). Groq path loses images and `tools` (section 0 item 5; `callGroqChat` message building keeps only text parts).

### 1.8 Do the configured Gemini model names exist?

Checked against the official pricing page (https://aistudio.google.com/docs/pricing, accessed 2026-11-19; the page was read only up to character 100,000 of 117,969):
- Listed: `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.6-flash`, `gemini-3.8-flash`, `gemini-3-flash-preview`, `gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`.
- Not listed on that page: `gemini-3.7-flash`, `gemini-3.5-flash`, `gemini-3.8-live` (page lists `gemini-3.1-flash-live-preview`), `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemma-4-26b-a4b-it`, `gemma-4-31b-it`. Aliases and Gemma may live on other pages. `gemini-flash-latest` is third in the default heavy chain and was not confirmed. Status Partially verified. `RETIRED_MODELS` / `sanitizeModelId` replace retired ids silently with defaults (a warning is logged), which contradicts the file's own "never silently rewrite" rule but protects availability.
- `KNOWN_MODELS` RPD/RPM numbers are free-tier figures; not checked against any page.

---

## 2. AI TASK REGISTRY

Legend. Group = `TASK_GROUPS` (tutor/structured/longdoc -> light Gemini chain `3.5-flash-lite`,`3.1-flash-lite`; build/grading -> heavy chain). OR = OpenRouter class. Cache column: router `cacheKey` (the `aiCache` collection) vs domain-level persistence in the feature's own document. "Zod" = `schema` passed to the router (JSON mode + `safeParse`). Rate limit: R = route `checkRateLimit` (in-memory per instance unless noted `shared`), Q = `checkRateLimitAndQuota` (shared, Firestore: 10/min students, 60/min teachers when not enforced; plan `perMinute` when enforced) plus token reservation. All callers use `requireUser`. Cost figures are estimates (section 4).

Only ONE call site uses the router `cacheKey` (`suggestLabIdeas` in `lib/studio/ai-build.ts`, key `studio_ideas:v1:<sha256(topic|description|level)>` plus `:lang=`; no TTL is set on `aiCache` documents and no TTL policy for `aiCache` was found in the repo (Assumption: none)). Everything else that is "cached" is stored on the feature's own Firestore doc.

### 2.1 Task ids that are used

| Task id | Group / OR class | Purpose and entry points (callers) | Prompt location | Input (size limits) | Output / validation | Cache / reuse | Quota and rate limit | Failure handling | Est. cost per call |
|---|---|---|---|---|---|---|---|---|---|
| `tutor_chat` | tutor / chat | Topic and class tutor: `runTeacherAgent` (`lib/teacher/orchestrator.ts`, route `app/api/ai/tutor`); notebook Q&A (`app/api/notebook/chat`); photo solver (`app/api/snap`, image up to 4.2 MB base64); Maker Studio tutor (`studioHelp` in `lib/studio/design-ai.ts`); Worlds tutor via the other gateway | `lib/teacher/prompts.ts` (`getTeacherSystemPrompt`), `generalTutorPrompt` inline in orchestrator, `lib/snap/prompts.ts`, inline in notebook route and `design-ai.ts` | system 0.8k tok + lesson up to 12,000 chars + history last 10 turns x 4,000 chars + DNA <=1,100 chars; message <=4,000 chars | Free text; no zod. Misconception tag `[[misconception: x]]` and `[[tool:calculator...]]` parsed by regex | None. Only the thread message is stored (`tutorThreads/.../messages`) | Q (checkRateLimitAndQuota 1200) + reservation 1500; no route R on tutor | `maxWaitMs:12000`, `maxRetriesPerModel:1`; on failure friendly 429/502 | $0.002 to $0.01 flash-lite |
| `structured_spec` | structured / bulk (OR) | Catch-all JSON: lesson-script (`app/api/teach`), glossary-like study prompts, quiz bank (`lib/practice/bank.ts`, 3 parallel calls) and flashcard bank (2 parallel), KC profile and content (`app/api/classes/[id]/kcs/[kcId]/...`), events/diagnostic quiz (`app/api/events`), goals plan (`app/api/goals`), translate (`lib/i18n/translate.ts`), report narrative (`lib/report/server.ts`), assignment architect/author/reviewer (`lib/teacher/assignmentAgent.ts`), material router, quality check, recommend, suggest (`lib/teacher/*`), notebook flashcards/quiz/discussion, studio-lab metadata (`lib/sim/studio-mode.ts`), past-question bulk scan | inline in each caller | varies 600 to 100,000 chars | zod in most; `teach` and `assignmentAgent` parse JSON themselves (no router schema) | Bank and script results persisted per class topic (generated once, lock `generatingAt` 3 min) | mixed: Q or `estimatedTokens`; `executeStructuredAiTask` default `isPrivileged` true for this task | schema fail -> same-model retries x3 per model; `Promise.allSettled` for banks | $0.003 to $0.03 |
| `class_build` | build / heavy | Course KC graph: `buildClassPlan` (`lib/teacher/classBuilder.ts`), `lib/teacher/recommend.ts` | inline in `classBuilder.ts`, `designSpec("common","class")` (`lib/ai/design-spec.ts`) | description <=4,000 chars + up to 100,000 chars of materials (scrubbed) | zod `classPlanSchema`; 8 to 50 KCs; cycle pruning in code | persisted as KC docs (idempotent slug ids) | teacher; `estimatedTokens:3500` (reservation under-estimates; real run 20k to 35k tokens); privileged | on `AiQuotaExhaustedError` the job pauses `waiting_quota` with `resumeAt` | $0.04 to $0.06 (3.6-flash) |
| `sim_build` | build / code | HTML5 simulation per topic (`lib/sim/store.ts`) and per learning objective piece (`lib/sim/pieces.ts`, up to 8 per KC) | `lib/sim/build.ts` (19 KB), `guide.ts`, `reference.ts`, `runtime3d.ts` | system ~5 to 8k tok + context 3 to 5k tok | free HTML text, `maxOutputTokens:16000`; validated by `parseGeneratedSimulation`, `interactionIssues` (no zod) | stored on the sim doc with version history; teacher-only; `sim-build` R 10/h, `piece-build` R 20/h (in-memory) | reservation `HEAVY_ESTIMATE` 8000 vs real 15k to 25k; privileged | up to 2 attempts, deadline 230 s; keeps "weak" first draft | $0.05 per attempt |
| `studio_build` | build / code | Maker Studio: plan BOM (`planProject`), design (`generateDesign`), edit (`editDesign`), fix after simulator, ideas (`suggestLabIdeas`, cached), paths (`lib/studio/paths.ts`), debug (`app/api/studio/debug`) | `lib/studio/ai-build.ts` (`PLAN_SYSTEM`, `IDEAS_SYSTEM`), `design-ai.ts` (`SYSTEM`, `EDIT_SYSTEM`), `parts/library.ts` (30 KB datasheet digest), `parts/shop.ts` | system up to ~12k tok (library digest + shop + example) + user prompt <=1,500 chars + edit: current spec <=60,000 chars | zod (`outSchema`, `planSchema`, `editSchema`, `ideasSchema`) plus simulator verification (`verifyProblems`) | ideas only (see above); designs saved by `createDesign` | R 8/min (`studio_ai`); NO feature limit | 2 attempts + 1 fix per attempt; deadline ~98 s | $0.02 to $0.08 per design call |
| `lesson_notes` | longdoc / bulk | Textbook chapter per KC (`lib/lesson/generate.ts`, teacher-only); lesson plans (`app/api/plans/generate`, `regenerate`) | `lib/lesson/textbook.ts` (6 KB), `designSpec` | material budget 24,000 chars + tree | Markdown (min 1,200 chars), `maxOutputTokens:16000`, `estimatedTokens:14000`; plans use zod | KC doc; lock 3 min; `force` regenerates | Q 14000; R none on lesson route | too short -> `AiGenerationError` | $0.017 (typ.), $0.043 (16k out) |
| `study_guide` | longdoc / bulk | Student notes set (`app/api/study/notes`, `notes/[id]` edit); Notebook studio outputs: guides, FAQ, timeline, briefing, cheat sheet (`lib/studio/generate.ts`, 6 variants share this task) | `lib/study/notes.ts` (`NOTES_SYSTEM`), `lib/studio/generate.ts` | source up to 150,000 chars (clip `NOTE_SOURCE_MAX` 120,000 x 1.25) | Markdown, min 40 chars, no schema | saved version on the notes doc | R 6/min + `checkFeature notes` + Q 9000 | 502 if too short | $0.017 to $0.036 |
| `explain_selection` | tutor / bulk | Glossary, term(s), mindmap explain (`app/api/study/glossary`, `term`, `terms`, `app/api/mindmap/explain`) | inline | selection <=800 to 14,000 chars (scrubbed) | `executeStructuredAiTask` zod (glossary/term), free text (mindmap) | none | Q 1200 and R | standard | $0.001 to $0.004 |
| `quiz_gen` | structured / bulk | Notes quiz (`app/api/study/notes/[id]/practice`), practice papers (`app/api/papers`), daily quiz (`lib/daily/build.ts`), **past-question solver (`past-questions` route, BROKEN: no schema)** | `lib/study/note-practice.ts`, `lib/papers/prompts.ts`, inline | notes <=30,000 chars; question <=3,000 | zod except the solver | notes practice persisted; papers stored; solver caches per cohort on the question doc | R 8/min, feature `practice`, Q 5000; solver also shared-daily 60 | solver throws 502 after paying | $0.005 to $0.01 |
| `card_gen` | structured / bulk | Flashcards from notes (`practice` route) and from topic/pasted text (`lib/flashcards/generate.ts`, `fenceUntrusted`) | `lib/study/note-practice.ts` (`CARDS_SYSTEM`), inline | notes <=30,000 chars; text <=12,000 | zod `cardsSchema` (1 to 40) | saved on notes doc | R 8/min + feature `practice` | standard | $0.005 |
| `grading_high_stakes` | grading / grading | Paper marking (`app/api/papers/[id]`), written answers (`app/api/grading/[id]/submit`), handwritten past-question grading (vision) | `lib/papers/prompts.ts`, `lib/grading/*`, inline | answers <=3,000 to 5,000 chars each; handwritten image <=4 MB | zod `aiMarkingSchema`, `AiGradeSchema`, `handwrittenGradeOutputSchema`; `temperature` 0 to 0.2 | result stored with attempt | R 10/h or 10/min, shared daily 25 for past-question grading | Heavy chain, falls to light with `reducedQuality` flag unseen by the student | $0.01 to $0.04 |
| `student_evaluation` | grading / grading | Learner gap report (`app/api/study/evaluation`) | `lib/evaluation/evaluate.ts` (EVALUATION_SYSTEM) | summary of wrong answers and mastery (max 40 KCs) | zod `evaluationSchema` | none | R 4/min + Q 4000; DNA injected | standard | $0.01 |
| `long_document` | longdoc / long | Scan OCR via vision (`app/api/documents/read`, up to `VISION_BATCH` images x 2 MB), notebook summary (`app/api/notebook/artifacts`) | `READ_SYSTEM` in `lib/documents/pages.ts` | images (base64 <=4.2 MB each) | free text split per page by `splitVisionAnswer` | not stored (images not stored) | R 30/min, feature `scan_pages`, Q 3000 per image | 502 if all empty; no check that the model actually received images | $0.0025 per page |
| `research_answer` | longdoc / heavy | Pre-build web research for Maker Studio (`researchProject`, tool `googleSearch`, Gemini only) | inline | prompt <=800 chars | text + `sources` from `groundingMetadata`; `catch` returns null | research object returned and stored on the design | none beyond studio R | any failure returns null; on OpenRouter/Groq `tools` is dropped | $0.004 + $0.014 per grounded prompt beyond 5,000 free per month |
| `notebook_mindmap` | structured / bulk | Mind map from sources (`app/api/mindmap/generate`, `lib/studio/generate.ts`) | `lib/mindmap/prompts.ts` | sources <=80,000 chars (scrubbed) | zod `rawNodeSchema` | none | R 6/min + Q 2500 | standard | $0.006 |
| `discussion_script` | longdoc / bulk | Podcast script create and extend (`lib/lesson/audio.ts`, teacher-only) | inline in `audio.ts` | material 14,000 chars + recording 9,000 chars | zod `scriptSchema`/`extendSchema` | audio meta doc; clips cached in `ttsCache` by `sha1(slot|text)` | Q 3000 to 4000 | lock 3 min | $0.014 |
| `quest_build` | structured / code | Challenge pack per learning objective (`lib/quest/store.ts`, up to 8 per KC) | `lib/quest/*` prompt builder | material 5,000 chars | zod `questResponseSchema`, normaliser; second attempt if <4 valid challenges | stored per piece; teacher-only; R 20/h | Q 6000, `estimatedTokens` 4500 | 2 attempts | $0.012 to $0.025 |

### 2.2 Task ids defined in `tasks.ts` with NO caller (dead; admin overrides have no effect)

`material_route`, `assignment_architect`, `assignment_author`, `assignment_reviewer`, `notebook_chat`, `notebook_artifacts`, `source_guide`, `paper_analysis`, `flashcard_gen`, `research_plan`, `class_study_guide`, `embedding`, `transcribe`, `voice_tts` (the last two exist only as admin labels; STT and TTS do not use the router). `voice` appears in `TASK_GROUPS` but not in `tasks.ts`. Verified by grep of string literals in `app/`, `lib/`, `components/` outside the registry files. `PERSONALIZED_AI_TASKS` in `router.ts` lists `notebook_chat`, `paper_analysis`, `assignment_reviewer` which are never invoked.

Impact: (1) The admin screen suggests it can put a strong model on the assignment agent; the agent really runs `structured_spec` (cheap light model, privileged: skips health checks). Assignment quality is therefore on the cheapest tier, unlike the declared design. (2) Learner DNA is never injected into `notebook_chat`, because notebook chat uses `tutor_chat` (so it does get DNA) while `paper_analysis` has no caller.

### 2.3 Worlds gateway task registry (`lib/ai/structured`)

Tasks: `ingest_vision`, `outline`, `extract`, `audit`, `world_design`, `activity_gen`, `grader`, `tutor_chat`, `hook_creative`. Callers: `lib/worlds/ingest.ts` (OCR page, vision), `extract.ts` (key facts, `maxTokens` 3000, batched by tier), `audit.ts` (conflict check), `tutor.ts` (`maxTokens` 900). Prompts are the only VERSIONED prompts in the repo: `prompts/{conflict_check,extract_ku,ocr_page,ping,tutor_grounded}.v1.md` plus `UNIVERSAL_PREAMBLE`. Validation: zod + repair loop (`maxRepairs` 2, `buildRepairPrompt` feeds the bad output back, so a failed run costs 3 calls per model) + chain failover; default `maxTokens` `min(4096, model.maxOutputTokens)`. Routes are empty by default: no route means `AiRouteMissingError` (good, explicit). No per-user quota or `aiPaused` (Verified). Only `worlds-create` 10/min, `worlds-report` 20/min, `worlds-images` 6/min route limits; per-page OCR and extraction of a large upload is bounded only by `maxConcurrentJobs` (default 3) and document size.

### 2.4 Non-LLM AI entries

- `app/api/stt`: Groq Whisper, per-user rate limit only, no quota. Whisper turbo list price $0.04 per audio hour (Groq model page via web search, accessed 2026-11-19).
- `app/api/tts`: 40 req/min/user in-memory, 1,200 chars each, NOT cached (`ttsKey` caching only in podcast `host-voice.ts`). Chain: Edge free voice (unofficial `edge-tts-universal` client), then OpenRouter TTS (English), ElevenLabs if the key is set, then Gemini TTS. See section 3.9.
- `embedding`: no embedding calls anywhere (`embedContent` not found). Notebook retrieval is keyword-based (`lib/notebook/retrieval.ts`).

---

## 3. Explicit answers, with evidence

### 3.1 Are all AI calls routed through the router?
No. See 1.1. Worlds gateway, TTS/STT and key-probe calls are separate. `generateStructuredJson` and `executeStructuredAiTask(userId undefined)` also skip the user budget. Status Verified. Confidence HIGH.

### 3.2 Hard-coded model names outside `lib/ai`
Verified clean for Gemini ids: the only hits are `lib/env.ts` (default `GEMINI_MODEL_FALLBACK`, whitelisted in `scripts/check-no-hardcoded-models.mjs`) and `scripts/`. Non-Gemini ids (llama, deepseek, claude, whisper) appear only in `lib/ai/**`, plus regex classifiers in `app/api/admin/system/groq-models/route.ts` (display only). Inside `lib/ai`, ids are hard-coded in `voice.ts` (`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`), `groq.ts` (`whisper-large-v3-turbo`, preference lists in `groq-models.ts`) and `openrouter-models.ts`, not in the `KNOWN_MODELS` registry. Acceptable by the CI rule, but a price/retirement change touches four files. Confidence HIGH.

### 3.3 Prompts duplicated or versioned?
Mostly inline template strings in the caller (about 30 distinct system prompts). Versioned files exist only for Worlds (`prompts/*.v1.md`). There is no prompt version stored with generated artifacts (no `promptVersion` field was found on lesson, quiz, bank or sim docs; sims store `modelUsed` and `version` of content, not of the prompt) so quality regressions cannot be tied to a prompt change. Duplication: the Socratic hint ladder text exists in three places (`getTeacherSystemPrompt`, `getAudienceSystemPrompt` in `lib/ai/prompts.ts`, and `MODE_RULES` in `design-ai.ts`), and the tutor prompt carries mastery and misconceptions twice (system prompt "LEARNER STATE" plus `PERSONAL_LEARNER_DNA`). `withModelMasterSkill` appends a per-model-family block (see `master-skills.ts`) to EVERY system prompt on every provider, adding roughly 150 to 300 tokens per call. Status Verified; the token figure is an estimate.

### 3.4 Are outputs validated?
- Zod via the router `schema` parameter: quizzes, cards, plans, marking, class plan, studio design, translations, report narrative. Tolerant JSON recovery (`extractJsonPayload`: fences, leading prose, brace matching).
- Not zod but custom: sims (`parseGeneratedSimulation`, `interactionIssues`), teach lesson script (`parseScript` after `extractJsonPayload`, falls back to `fallbackScript` = the notes themselves), assignment agent (free text/JSON by hand).
- Not validated at all: tutor text, study notes (only length >= 40), lesson (length >= 1,200), notebook answers (citation tags `[S1]` are requested but never checked against the retrieved set), research notes.
- Semantic validation exists in only two places: Maker Studio (circuit checker + simulator tests, `verifyProblems`) and quiz-answer leak guard concept (`containsAnswerLeak` in `lib/ai/prompts.ts`: check whether it is actually called by the tutor route; grep shows it is not imported by `orchestrator.ts`; Partially verified: only the prompt instruction "never reveal the final answer" protects active quizzes).
- No maths correctness check: LaTeX or numeric answers in quizzes/solutions are not recomputed. Master-skill text tells the model to "verify the keyed answer", which is a prompt, not a check.

### 3.5 Token and output-length limits
Explicit `maxOutputTokens`: sim and piece builds 16,000; lesson 16,000; Worlds default 4,096 (900 tutor, 3,000 extract). Everything else (tutor, notes, quizzes, studio, research, grading) sets none, so Gemini uses the model default and, importantly, thinking tokens count as output and are billed at the output rate (no `thinkingConfig` set anywhere: grep found none). Input limits are character clips per caller (section 2). Per-request guard: `estimatedTokens` reservation; the reservation is much lower than real use for builds (3,500 reserved vs ~25k used for class_build; 8,000 default for sims), so concurrent builds can overshoot a student/teacher budget by multiples. Impact MEDIUM.

### 3.6 Retries and fallback chains that multiply cost (worst case per user action)

Definitions: "billed attempt" = a response that was returned and charged but rejected (schema mismatch, unusable HTML). Rate-limit, 404 and 5xx failures are not charged by providers. Light chain = 2 models, heavy chain = 5 models; 3 attempts per model for schema tasks; OpenRouter emergency adds 2; Groq adds 1.

| Step | Calls without schema | Calls with zod schema (worst case) |
|---|---|---|
| One `generateWithFallback`, light task | 1 billed | 2 models x 3 + 2 OR + 1 Groq = 9 |
| One `generateWithFallback`, heavy task | 1 billed | 5 x 3 + 2 + 1 = 18 |
| Active provider openrouter then Gemini | 2 | up to 20 (2 OR + the Gemini figure above) |

Computed per user action (typical = everything works first time; "one bad JSON" = one billed rejection; "theoretical worst" = every schema attempt returns a billed bad answer, practically very unlikely; shown only so it is bounded):

| Action | Calls in the happy path | Realistic bad day | Theoretical worst |
|---|---|---|---|
| `sim_build` HTML create | 1 (`maxOutputTokens` 16k) | 2 (second attempt after `interactionIssues`) | 2 (no schema, so no hidden retries) |
| `sim_build` studio medium (`generateStudioSimulation`) | design 1 + meta 1 = 2 | 1 fix + HTML fallback 2 = 5 | design 15 + fix 15 + meta 6 + HTML 2 = 38 |
| `sim_build` piece (per objective) | 1 | 2 | 2 (or 38 if studio medium) |
| `class_build` plan | 1 | 2 to 3 (schema retries on same model) | 18 |
| `class_build` whole class (20 KCs) | 1 + 20 lessons + 20x(3+2 bank calls) + 20 scripts + 20 audio scripts + up to 160 quest calls + up to 160 sim piece calls | n/a | thousands; bounded by teacher clicks, not by a budget |
| `studio_build` from a prompt | plan 1 + research 1 + design 1 (+ verify fix 1) = 3 to 4 | 5 to 6 | plan 18 + research 1 + 2 designs x 18 + 2 fixes x 18 = 91 |
| `studio_build` edit | 1 | 2 | 36 |
| Tutor turn | 1 | 1 | 1 (`maxRetriesPerModel` 1, no schema, maxWait 12 s) |
| Worlds extract page | 1 + repairs (<=2) | 3 | 3 per model x chain length (<=8 models) = 24 |

Observations. (a) The only structural multiplier that is certain is the `askForDesign` loop (up to 2 designs, each with 1 simulator fix) and the quiz-bank fan-out (5 parallel calls per topic). (b) The sim HTML path uses no schema, so it does NOT suffer hidden same-model retries: good. (c) Schema retries re-send the full prompt with no backoff signal to the user and are charged against the same reservation (the final `settleQuota` counts only the last successful response tokens, not the rejected attempts): quota under-counts real spend on a bad day. (d) Gemini model-health marking (`markModelExhausted`) stops hammering a dead model, which limits waste on quota errors. Status Verified (code reading), counts are computed, not observed.

### 3.7 Does fallback preserve output format?
Partly. The same `schema` is applied after every provider, and `withModelMasterSkill` adds JSON discipline for each model family, so JSON tasks survive a switch (a failure falls through to the next model). Not preserved: (1) images (Groq, see section 0 item 5); (2) `tools` / Google Search grounding (OpenRouter, Groq); (3) system-instruction semantics on Gemma overflow models; (4) `temperature` is omitted for Claude 5.x on OpenRouter (`openRouterSupportsTemperature`), so low-temperature grading (`temperature:0`) runs at provider default; (5) token accounting differs (`tokensIn`/`tokensOut` fall back to 300/400 on Groq and 500/600 on Gemini when usage is missing), so quota settlement can be wrong. Quality differences across providers are invisible to the user (`reducedQuality` is returned by the router when a heavy task lands on a "lite" model, but no caller was found that shows it; Partially verified).

### 3.8 Expensive models used unnecessarily?
- `quest_build` (pure JSON challenge packs) maps to the OpenRouter `code` class (qwen3-coder first, then deepseek-v4-flash) rather than `bulk`; on Gemini it correctly uses flash-lite.
- `research_answer` and `research_plan` map to OpenRouter `heavy` (deepseek-v4-pro then Claude Sonnet 5.5) although the only caller is a quick pre-build note.
- `student_evaluation` is `grading` (Claude Sonnet 5.5 first on OpenRouter; Gemini 3.6 Flash on Gemini) for a short study plan; a flash-lite call plus rule-based gap detection would do.
- `grading_high_stakes` for notes-based practice papers marks; the extended-answer marking is justified, MCQ marking is not an LLM job at all (check `lib/papers/logic.ts`).
- `sim_build` on 3.6/3.8 Flash is the right class of model, but the price doubles from 2027-01-01 (section 4.1).
- The `studio_build` task is used for the plan BOM and the lab-idea list, both of which are small structured outputs; they run on the strongest model.
- `reasoningEffort:"medium"` for the whole `heavy` OpenRouter class, including research. Hidden reasoning tokens are billed.

### 3.9 Can users trigger repeated identical generations?
Yes, in these places: 
- Notes practice `regenerate:true` and teach `regenerate:true` (own notes): bounded by R 8/min and 6/min (in-memory per instance), by `checkFeature` only when billing is enforced, and by the 50,000-token student default otherwise. A student can burn their allowance, not more.
- First-open class lesson script (`app/api/teach`, source `kc`): ANY student can trigger generation when `teachScript` is missing, there is no lock, and N students opening a freshly published topic at once launch N parallel generations (the same text written N times, last write wins). Verified (no `generatingAt` lock in this route, unlike lessons, banks, quests, sims). Cost small ($0.012 x N) but unbounded by design; fix with a lock or `classOwner` pre-generation.
- Studio ideas: cached via `cacheKey`.
- `/api/tts`: no cache, 40 req/min/user per instance, up to 1,200 chars; on Vercel Edge TTS may be blocked from datacentres (the code itself says so), so repeated identical lines fall through to paid engines each time. Impact HIGH if `ELEVENLABS_API_KEY` is set (ElevenLabs Flash price in code comments is $40 per M chars, unverified, so a 1,200-char line is $0.048; 40 per minute = $1.9 per user-minute).
- Teacher builds: sim/piece/quest rebuilds are limited by in-memory hourly limits only.
Because most `checkRateLimit` calls omit `shared:true`, limits are per serverless instance: effective limit is roughly (limit x concurrent instances). Only the past-question daily limits (`pastq_grade_day` 25, `pastq_solve_day` 60, `pastq_scan_day` 20) and `evaluateSharedRateLimit` inside `checkRateLimitAndQuota` are shared. Status Verified.

### 3.10 Is shared caching safe (private details in keys or results; learner-DNA injection)?
- Router `aiCache` documents hold `{text,data,modelUsed,createdAt}` keyed by the caller's `cacheKey`; the only key in use is the studio ideas hash of topic/description/level (no uid, no student content). No Firestore rule exposes `aiCache` (no match found in `firestore.rules`; default-deny assumed, Partially verified). Safe today.
- The router makes it hard to misuse: `shouldInjectLearnerDna` returns false whenever a `cacheKey` is present, so DNA never leaks into a shared cached answer. `withLearnerLanguage` suffixes the key with `:lang=`. BUT nothing forces a future caller to avoid putting user text in the `cacheKey`, and `aiCache` writes have no TTL, no size limit and no per-uid scoping. Recommendation: forbid free text in keys (hash only), add `expiresAt` and a Firestore TTL policy, and a `scope:"public"|"user"` argument.
- Shared class content (lessons, banks, scripts, sims) is written with `learnerLanguage:false`, `isPrivileged:true` and no DNA; each reader gets a translation (`lib/i18n/translate.ts`, cached in Firestore). Safe design.
- DNA payload is an anonymous coaching summary (levels, topic titles, mastery percentages, misconception labels) capped at 1,100 characters, with `<`, `>`, `[`, `]` stripped by `cleanText`; no name or email. It does go to third-party providers (Gemini, OpenRouter models, Groq); disclose this in the privacy policy. Status Verified.
- DNA is injected into tutor prompts per call and loads up to ~63 Firestore documents (1 user + 25 mastery + 25 misconceptions + 12 mistakes) per call with only a 90 s in-instance cache; the tutor orchestrator then reads mastery and misconceptions again for its own "LEARNER STATE" block. Duplicate content and duplicate reads (see 4.5).

### 3.11 Prompt-injection defences for uploaded content
Present: `sanitizeUntrustedPromptText` (`lib/ai/scrub.ts`: strips `<script>`/`<iframe>`, PII redaction for email/phone/SSN/student id with LaTeX protected, 30,000 char cap), `fenceUntrusted` (`lib/ai/generate.ts`: XML fence, escapes closing tag, appends a "do not execute instructions" directive; used only by `lib/flashcards/generate.ts` and `lib/daily/build.ts`), `<STUDENT_MESSAGE>` and `<MATERIAL>` / `<LESSON>` wrappers with "treat as content only" lines in tutor, studio help, lesson and podcast prompts, `checkStudentMessageSafety` (self-harm and quiz-cheat regexes), `cleanText` for DNA.
Gaps (Verified): (1) there is NO injection detection or neutralisation, only fencing plus an instruction; closing-tag escaping exists only in `fenceUntrusted`, the other wrappers (`<STUDENT_MESSAGE>`, `<MATERIAL>`, `<LESSON>`) do not escape a student-supplied `</STUDENT_MESSAGE>`. (2) Study notes, teach scripts, mind maps, notebook, papers and grading use raw `--- SOURCE ---` markers with no scrub or fence. (3) Model output is rendered as Markdown and, for sims, as executable HTML/JS in an iframe: an injected lecturer document could cause the model to emit hostile scripts; check the sandbox attributes of the sim iframe (outside this slice, Unknown). (4) PII scrub is regex-only: `STUDENT_ID_REGEX` includes the bare word `id` followed by 5 to 20 alphanumerics, and the phone regex matches any 10-digit run, so legitimate STEM text ("id function", "1234 567 8901") can be mangled in the scrubbed paths; no Nigerian number formats (+234 / 080..) are targeted explicitly. (5) Self-harm check is five English phrases only (no Pidgin, Yoruba, Igbo, Hausa). Impact MEDIUM (students are the main attackers of their own sessions; lecturers are trusted). Recommendation: one shared `wrap(label, text)` helper with escaping, applied to every user-originated string, and an output scan before rendering model-authored HTML.

### 3.12 Grounding in lecturer-published materials
Strong for class content: `loadKcGroundingContext` (`lib/kc/context.ts`) builds `contextText` from the published lesson, objectives and relevance-ranked excerpts of uploaded materials with a per-call character budget (5,000 to 24,000), plus `scopeRule` topic locks to stop sibling-topic drift, and the tutor uses `lessonForStudents` (published) rather than drafts for students. Weak: the tutor prompt says "ground in the approved lesson material; you may use well-established general knowledge", so answers are not constrained to the lecturer's material and there is no citation of lecturer pages in tutor answers. Notebook chat is truly source-grounded (top-5 keyword-retrieved 500-token chunks, `[S1]` tags, refusal sentence), but retrieval is lexical only (no embeddings; `embedding` task unused) so paraphrased questions miss. `retrieveRelevantChunks` returns nothing when no keywords match and the endpoint answers "couldn't find" without an AI call: cheap and safe. Source grounding is client-supplied: the notebook API accepts the `sources` array from the browser (unbounded `content` strings), which is both a cost vector (huge request bodies) and an integrity point.

### 3.13 What happens when all providers fail?
User-visible: `AiQuotaExhaustedError` (429 "The AI is at its daily limit... after <Pacific midnight>") only when a quota problem was seen, otherwise `AiGenerationError` (502 retry message); an admin pause returns 503 `AI_PAUSED`; a missing key returns 503 `AI_NOT_CONFIGURED`. Class builds pause in `waiting_quota` with `resumeAt` (but the "resume" is a stored timestamp; no scheduler/cron that resumes it was seen in this slice, Unknown). Sim, lesson, bank, quest and audio generators clear their `generating` flags and show an error; tutor shows "Sorry, I couldn't come up with an answer". The reservation is released, so users are not charged. There is no degraded mode (e.g. serve a cached explanation, template quiz, or queue-and-notify) and no alerting hook in this slice (health is computed on demand for the admin tab). Pacific midnight reset text is correct for Gemini free tier only.

---

## 4. AI COST MODEL

### 4.1 Prices used (official pages; accessed 2026-11-19)

| Model | Input $/M | Output $/M (incl. thinking) | Source |
|---|---|---|---|
| gemini-3.5-flash-lite | 0.30 | 2.50 | https://aistudio.google.com/docs/pricing |
| gemini-3.1-flash-lite | 0.25 | 1.50 | same |
| gemini-3.6-flash / 3.8-flash | 0.75 until 2026-12-31, then 1.50 | 3.75 until 2026-12-31, then 7.50 | same |
| gemini-3-flash-preview | 0.50 | 3.00 | same |
| gemini-3.8-flash-lite-tts | 0.50 text (1.00 from 2027) | 6.00 audio (12.00 from 2027) | same |
| gemini-3.8-flash-tts | 0.50 text (1.00 from 2027) | 9.00 audio (18.00 from 2027) | same |
| Google Search grounding (Gemini 3+) | 5,000 free requests per month, then $14 per 1,000 | | same |
| Groq Whisper large-v3-turbo | $0.04 per audio hour | | https://console.groq.com/docs/model/whisper-large-v3-turbo (via search result) |
| Groq Llama 3.3 70B / 3.1 8B | UNKNOWN: Groq docs list "Contact Sales"; do not use | | https://console.groq.com/docs/models |
| OpenRouter deepseek-v4-flash | about $0.05 in / $0.09 to $0.45 out depending on snapshot and provider (search snippets disagree) | | https://openrouter.ai/deepseek/deepseek-v4-flash (not independently confirmed) |
| Other OpenRouter ids in `openrouter-models.ts` (Haiku 5.5, Sonnet 5.5, deepseek-v4-pro, qwen, glm, kokoro) | UNKNOWN: the catalogue fetch did not return prices | `https://openrouter.ai/api/v1/models` | 
| Firestore | free quota 50,000 reads, 20,000 writes, 20,000 deletes per day (official page); unit prices vary by location and were not retrieved. Planning placeholder (assumption, verify): $0.06 per 100k reads, $0.18 per 100k writes in multi-region | https://firebase.google.com/docs/firestore/pricing |

The router's own `applyUsage` estimate (`estimatedCostUsd` in `usage` docs) hard-codes $0.075 per M input and $0.30 per M output ("Gemini Flash"): about 4x too low for flash-lite input and 8x too low for output, and 10x / 12x too low for 3.6 Flash. The `usage/<uid>_<period>` documents therefore under-report cost; do not use them for margin analysis. Verified.

Price risk: from 2027-01-01 build tasks on `gemini-3.6-flash` cost twice as much (input 1.50, output 7.50). Both default heavy models carry the increase.

### 4.2 Token assumptions per action (ESTIMATES from prompt text size; not measured)

1 token ~ 4 characters. Thinking tokens are billed as output and are NOT in these numbers unless stated; the real output could be 1x to 3x higher on Gemini 3.x with default thinking. Measure before trusting (4.6).

| Action | Model (default) | Input tokens | Output tokens | Cost now | After 2027-01-01 |
|---|---|---|---|---|---|
| One tutor turn (typical history) | 3.5-flash-lite | 5,000 (max ~15,000) | 700 | $0.0033 (max $0.007) | same |
| One tutor conversation, 8 turns, history grows | 3.5-flash-lite | 6,000 average | 700 | $0.027 | same |
| One interactive lesson (script) | 3.5-flash-lite | 8,000 | 4,000 | $0.012 | same |
| One textbook lesson (class topic) | 3.5-flash-lite | 8,000 | 6,000 (cap 16,000) | $0.017 (cap $0.043) | same |
| One set of notes (student) | 3.5-flash-lite | 8,000 (max 37,500) | 6,000 (max 10,000) | $0.017 (max $0.036) | same |
| One quiz (10 q) | 3.5-flash-lite | 4,000 | 2,500 | $0.0075 | same |
| One flashcard deck (16 cards) | 3.5-flash-lite | 4,000 | 1,500 | $0.005 | same |
| One class quiz bank (66 q, 3 parallel) | 3.5-flash-lite | 3 x 4,000 | 3 x 3,300 | $0.030 | same |
| One class flashcard bank (40 cards, 2 parallel) | 3.5-flash-lite | 2 x 3,000 | 2 x 2,000 | $0.012 | same |
| One research answer (Studio pre-build, grounded) | 3.5-flash-lite + Search | 1,000 | 1,500 | $0.004 + $0.014 per grounded prompt after the free 5,000 per month | same |
| One AI class build plan (20 KCs) | 3.6-flash | 8,000 typical (max 26,000) | 8,000 (max 10,000) | $0.036 (max $0.057) | $0.072 (max $0.114) |
| One HTML simulation, 1 attempt | 3.6-flash | 10,000 | 12,000 (cap 16,000 incl. thinking) | $0.053 (cap $0.068) | $0.105 (cap $0.136) |
| One simulation, studio medium (design + fix + meta) | 3.6-flash + flash-lite | 12,000 x 2 + 3,000 | 6,000 x 2 + 1,500 | $0.075 | $0.15 |
| One Maker Studio design from a prompt (plan + research + design [+ fix]) | 3.6-flash, flash-lite | 8,000 + 1,000 + 12,000 [+12,000] | 1,500 + 1,500 + 6,000 [+6,000] | $0.07 to $0.11 plus search | $0.13 to $0.21 |
| One audio lesson script | 3.5-flash-lite | 5,000 | 5,000 | $0.014 | same |
| One audio lesson recording, 10 min, Edge voice | n/a | | | $0 (unofficial free service, see 4.4) | $0 |
| Same recording through Gemini TTS Lite fallback (about 19k audio tokens at an assumed 32 tokens per second, unverified) | gemini-3.8-flash-lite-tts | 2,500 text | 19,000 audio | $0.12 | $0.23 |
| Same through ElevenLabs Flash (price from code comment: $40 per M chars, unverified), 10k chars | | | | $0.40 | $0.40 |
| One scanned page (OCR) | 3.5-flash-lite | 1,500 | 800 | $0.0025 | same |
| One photo problem (snap) | 3.5-flash-lite | 2,000 | 800 | $0.0026 | same |
| One practice-paper marking (10 answers) | 3.6-flash | 3,000 | 1,500 | $0.008 | $0.016 |

OpenRouter and Groq costs per action cannot be stated: official prices for the models in `openrouter-models.ts` could not be confirmed (4.1). The router's pessimistic fallback ($3 / $15 per M) would give $0.19 for a 12k-output sim, which shows why the $1.50 daily cap trips after about 8 sims.

Fully built 20-topic class (teacher side, Gemini): per topic textbook lesson $0.017 + quiz bank $0.030 + flashcard bank $0.012 + teach script $0.012 + podcast script $0.014 + 4 quest packs (1.2 calls each at ~$0.012) $0.058 + 4 sim pieces (1.2 attempts each at $0.053) $0.25 = about $0.39 per topic, so about $7.7 per 20-topic class now; about $6.5 if sims are skipped for half the topics; the class plan itself adds $0.04. About 64 percent of the total is simulations. After 2027-01-01 sims double: about $12 per class. Plus voice if Edge TTS is unavailable ($0.12 to $0.40 per topic podcast).

### 4.3 Monthly cost per student (explicit assumptions; Gemini flash-lite; NOT measured)

Shared class content is generated once, charged to the teacher/class owner, and costs a student nothing. Students pay only for personal AI.

| Usage | Light student (free plan) | Average student (Plus) | Heavy student (Pro) |
|---|---|---|---|
| Tutor turns | 20 | 60 | 300 |
| Notes sets | 1 | 4 | 15 |
| Quizzes and flashcard sets | 2 | 6 | 30 |
| Interactive lessons (own notes) | 0 | 4 | 30 |
| Scanned pages / photo problems | 0 / 0 | 30 / 10 | 150 / 40 |
| Practice papers marked | 0 | 2 | 10 |
| Daily quizzes (30 per month at $0.003) | 0 | 30 | 30 |
| Maker Studio designs | 0 | 0 | 6 |
| AI cost | about $0.10 | about $0.62 | about $3.50 |
| Firestore (see 4.5) | about $0.001 | about $0.005 | about $0.03 |
| Plan price (code, naira) | free | N3,500 | N6,000 |

Reading the table. At an assumed N1,500 per US$ (not verified; use the live rate) Plus brings about $2.3 and Pro about $4.0 before Paystack and VAT. Heavy-student AI cost of about $3.5 leaves little or negative margin on Pro; the Pro monthly token budget (3,000,000 tokens, i.e. about $2 to $3 of flash-lite) is the real ceiling. The free plan is protected by the 50,000 token default (`STUDENT_TOKEN_LIMIT`, also what a signup stamps): 20 tutor turns need about 134,000 tokens counted with history, so a light free student is cut off after about 8 turns, which is a retention issue, not a cost issue (cost ceiling about $0.04 per free student per month). The plan page says Free = 100,000 tokens but the guard uses the larger of `monthlyTokenLimit` (50,000 at signup) and the plan value only when billing is enforced: free users get 50,000 until enforcement is switched on. Status Verified. Scenario costs assume no thinking overhead; if thinking triples output, tutor conversation cost roughly doubles.

Teacher monthly: a teacher with 25 full-class builds per month (the Teacher plan allowance, N7,500) would cost about $190 at $7.5 per build, i.e. 50x the plan price, and nothing in code stops them (limit not enforced, tokens uncapped without billing enforcement). Even at 2 builds per month the cost is about $15 against N7,500 (about $5). The class build must be priced or metered per topic, or sims must be made optional/generated on demand.

### 4.4 Other external costs

- TTS: Edge neural voices via `edge-tts-universal` are an unofficial client of a Microsoft service; its availability and terms of use for commercial products are Unknown, and the code itself assumes it can be blocked from cloud datacentres (circuit breaker `edgeState`). Fall-through engines are paid. Igbo and Hausa lines always go to Gemini TTS first (`speaksWithGemini`) at the Flash TTS price above.
- STT: Groq Whisper $0.04 per hour of audio: negligible (a 30 second clip $0.0003).
- Podcast audio storage: clips live in Firestore documents as base64 (`ttsCache`, up to 700 KB inline per doc, split into `p` sub-documents above that, `MAX_BYTES` 6 MB). Firestore storage and network egress are more expensive than object storage/CDN for audio. Unknown: actual egress; plan: log bytes per replay.
- Google Search grounding: 5,000 free per month then $14 per 1,000 (only Gemini path).
- Vercel (function duration up to 120 to 300 s for builds, `maxDuration`), Paystack fees: out of this slice.

### 4.5 Firestore per active user (reads and writes from the AI flows)

Per tutor turn, counted from code (estimates, rounded): quota guard `checkRateLimitAndQuota` (user 1R, rate-limit doc 1R+1W, open reservations query 0 to 2R), `reserveQuota` transaction (user 1R, reservations 0 to 2R, 1W), `settleQuota` (reservation 1R, user 1R, usage doc 1R, 3W), language lookup 1R, learner DNA 1 + up to 62 reads (cache 90 s per instance), tutor context (kc, class, mastery, up to 10 misconceptions) about 13R, audience tags 1R, thread message 1W. Total about 22R without a DNA cache hit miss and about 85R with a DNA miss; about 6W. At the placeholder multi-region prices that is about $0.00006 per turn, roughly 2 percent of the AI cost of the turn. For 300 turns (heavy) about 25,000 reads and 1,800 writes: about $0.02. Daily free quota (50k reads) is consumed by about 600 DNA-missing tutor turns per day project-wide, so reads matter at roughly 600 turns per day, before counting the rest of the app (feeds, community, classes). The `rateLimits` and `quotaReservations` collections are a write on every AI call; make sure TTL policies on `purgeAt` exist (the code writes `purgeAt`, the policy itself was not verifiable here).

### 4.6 Measurement plan (no production data was available)

1. Add `taskId`, `provider`, `model`, `tokensIn`, `tokensOut`, `thinkingTokens` (Gemini `usageMetadata.thoughtsTokenCount`), `attempts`, `fallbackTriggered`, `cached`, `userId hash` to a single `aiCalls` log (or extend `usage` docs) and fix `estimatedCostUsd` with a price table.
2. Record `thoughtsTokenCount` for one week to learn the thinking multiplier before choosing budgets; test `thinkingConfig` minimal/low for tutor, quiz, notes.
3. Count billed-but-rejected attempts per task (schema failure rate, `interactionIssues` failure rate) to validate section 3.6.
4. Dashboard: cost per active user per tier per week, cost per task, share of calls hitting each chain position, and Firestore reads per AI call (DNA miss rate).
5. Alert at 50 / 80 percent of a global daily USD budget and on any single user above N times the median.

---

## 5. AI QUALITY: teaching vs content generation

Verdict: the layer is a content-generation platform with a thoughtful tutoring veneer on one path (class topic tutor). Most features generate artefacts (notes, quizzes, labs, podcasts) and are not designed as a learning loop.

| Dimension | Evidence | Rating |
|---|---|---|
| Socratic tutoring | `getTeacherSystemPrompt`: diagnose first, 3-tier hint ladder, one concept per message, "I don't get it" representation pivot, mastery bands (P(L) < 0.40 and >= 0.85); `getAudienceSystemPrompt` modes (ADHD micro-steps, literal, adversary, kids). But the general tutor prompt says "answer directly and correctly first", and the topic tutor is never evaluated for actually following the ladder; no answer-leak check in code (the helper `containsAnswerLeak` exists and appears unused by the tutor route) | Good prompt, unverified behaviour |
| Misconception-aware feedback | Tutor emits `[[misconception: label]]`, persisted by `trackMisconception`; labels re-enter next prompts (learner state + DNA). Marking prompts ask to name the misconception. Free-text labels, no taxonomy, no resolution loop evidence | Moderate |
| Source grounding / citations | Notebook chat: strong rule and tags, no tag verification; class content: grounded by published lesson and materials but not cited; tutor allows general knowledge | Moderate |
| Level adaptation | `levelInstruction` (simple/standard/lecturer), audience tags, DNA scaffold choice (micro-steps, worked-example-first, stretch), mastery bands. Real adaptive signal (BKT `pL`) feeds prompts | Good |
| Hallucination controls | Prompts: "never invent facts", "say when unsure", datasheet grounding and simulator verification in Maker Studio (best-in-repo), sims `interactionIssues`. No retrieval verification for tutor, no self-consistency, no citation check, OpenRouter/Groq path drops web search | Weak outside Studio |
| Maths / engineering correctness | LaTeX instructions; calculator tag hand-off (`[[tool:calculator|expr=...]]`) is a good pattern; circuit checker and behaviour tests for Studio. Quizzes, papers, past-question solutions are never recomputed (no CAS, no second-model check, `grading_high_stakes` at temperature 0 to 0.2 only) | Weak |
| Difficulty calibration | Quiz focus buckets (conceptual / calculation / application), `deriveBktPriors` from KC difficulty, `pickAdaptiveQuizFocus`; no item calibration from real attempts (no IRT, `difficulty` is the model's own label) | Basic |
| Multilingual | `languageDirective`, shared-content translation pipeline with per-reader cache, Edge/Gemini voices, Igbo and Hausa native Gemini TTS, Pidgin mentioned in plans. Safety regex English-only; quality of Pidgin/Yoruba/Igbo/Hausa text unmeasured; non-English text costs more tokens | Ambitious, unmeasured |
| Nigerian curriculum relevance | Past-question solver and CBT concept (JAMB / university style) and the Claude master-skill line "culturally relatable examples" show intent; no curriculum map (WAEC, NECO, JAMB, NUC CCMAS) was found in prompts; "Nigerian" appears in plan copy rather than in prompts (Partially verified by reading only the files in this slice) | Intent, little encoded |
| Pedagogy of lessons | `textbookSystemPrompt` (intuition -> example -> formal rule -> check; numbered like a textbook) | Good |

Two quality bugs found: the past-question solver (section 0.2) and vision fallbacks (section 0.5). A "reducedQuality" flag (heavy task answered by a lite model) is computed and not surfaced.

---

## 6. Recommended task-routing matrix (RECOMMENDATION only; no code changed)

Principle: cheap by default, strong only where one wrong answer is visible to a mark or costly to teachers, and cache anything that more than one learner can reuse.

| Task | Recommended model class | Why |
|---|---|---|
| tutor_chat (topic/class/general) | cheap (flash-lite, minimal thinking); escalate to medium only when the student says "still stuck" twice or the topic is quantitative | 80 percent of volume, answer quality dominated by context not model size |
| explain_selection, glossary/terms | cheap | tiny |
| notebook_chat | cheap, enforce citation check | grounded |
| study_guide, notes | cheap | long input, long output, cost scales with output |
| lesson_notes (class textbook chapter) | medium once per topic, human-reviewed | read by many; worth quality |
| quiz_gen / card_gen / banks | cheap generation + deterministic validators (answer index, duplicates) + optional medium "verify key" pass for calculation items only | verification is cheaper than a strong generator |
| structured_spec (assignment agent) | author medium, reviewer cheap; re-map to the intended `assignment_*` ids | |
| grading_high_stakes | strong for free-text marking; rule-based for MCQ; cache nothing | marks seen by students |
| student_evaluation | cheap + rules | |
| class_build plan | medium | one call, big downstream effect |
| sim_build / sim piece | medium, with a strict `maxOutputTokens`, ONE attempt then template fallback; generate on demand when 5 students open it, not for every objective | the money sink |
| studio_build plan, ideas | cheap | structured small output |
| studio_build design / edit | medium + simulator verification | |
| quest_build | cheap, move OpenRouter mapping from `code` to `bulk` | JSON packs |
| research_answer | cheap + Search grounding | |
| long_document / OCR | cheap multimodal; deny non-vision models | |
| discussion_script | cheap | |
| TTS | free engine first for English, Gemini TTS Lite for Igbo/Hausa, never ElevenLabs on user-initiated requests | |
| Worlds extract/outline | cheap (tiny/standard tier) with strong only for `audit` | |

### 6.1 Cheapest safe AI architecture for this platform

1. One gateway. Move Worlds and TTS behind `generateWithFallback`-style admission (kill switch, per-user budget, spend ledger).
2. Budget in dollars, not tokens: price table per model, per-user monthly USD budget, global daily USD cap, reserve before the call, settle after, include rejected attempts.
3. Cache aggressively and publicly where content is not personal: lesson scripts, banks, translations, idea lists, solutions per (question, cohort) with TTL and a content-hash key; per-user caching only for personal artefacts.
4. Pre-compute once per class topic (lesson, bank, script, audio) by the teacher plan; students consume. Already the intent of `plans.ts`; make it enforced.
5. Gemini flash-lite as the default for everything student-facing; one medium model for builds; strong model only for free-text marking and calibrated disputes. Set `thinkingConfig` low/minimal on light tasks; set `maxOutputTokens` on every call.
6. Replace "multiple attempts per model" with one repair attempt on the same model then one fallback, and a global per-action call budget (`CallBudget` exists in `router.ts` and is used by only one caller).
7. Deterministic checks before LLM checks (schema, answer index, dedupe, circuit checker, regex citation tags).
8. Make free-tier capacity explicit: if on the Gemini free tier, stop sending student text to it (training use) and move to paid keys with budgets; with paid keys, remove the free-tier RPD limits that throttle `isModelAvailable` (`KNOWN_MODELS` `rpd`).
9. Shared rate limits (`shared:true`) for anything that costs money.

---

## 7. What can bankrupt the startup, and best value

Most likely to bankrupt: **AI class build with auto-generated simulations**, i.e. teacher-side bulk generation (`sim_build` per topic and per objective piece up to 8 per topic, plus quest packs, lessons, banks and podcast scripts and TTS), because (a) it is the biggest per-action cost (about $7 to $8 for a 20-topic class now, about $12 after the Gemini price rise, potentially $20+ with OpenRouter reasoning-heavy models and the 16k-token output ceiling), (b) the Teacher plan advertises 25 to 100 builds per month, (c) the limit is not enforced and teachers are uncapped on tokens until billing enforcement is on, (d) per-minute and hourly limits are per instance, (e) reservations are far below real use so concurrency overshoots, (f) the only dollar cap protects OpenRouter, not Gemini, and (g) token accounting excludes rejected attempts. A teacher plan at N7,500 (about $5) can lose money after one build. Close second: **uncapped TTS fall-through** (`/api/tts`) if Edge is blocked and ElevenLabs or OpenRouter voices are keyed. Third: **Worlds** ingestion (no per-user budget, repair loops, chains up to 8 models).

Best value to cost (estimated cost to teach/serve one unit):
1. Shared class content generated once (textbook lesson $0.017, quiz bank $0.03, flashcard bank $0.012, podcast script $0.014) and read by every student: pennies, amortised over a class.
2. Tutor chat on flash-lite: $0.0035 per turn, the daily-habit feature.
3. Scans/OCR and photo solver: $0.0025 each, high perceived value.
4. Notes-to-quiz and flashcards: $0.005 to $0.0075, retention value.
5. Past-question solver with cohort cache (once fixed): solution cost amortised across the cohort; best Exam Pass hook.
Worst value: per-objective simulations, studio designs with fix loops, and any heavy-model research.

---

## Open questions

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
