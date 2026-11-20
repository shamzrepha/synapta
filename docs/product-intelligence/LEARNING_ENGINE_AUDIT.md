# Learning Engine Audit (BKT, FSRS, misconceptions, Learner DNA, closed loop)

Read-only audit of `shamzrepha/synapta` (SunRootLearn), learning-engine slice. Method: reading source with git grep and cat; no builds, servers,
migrations, network or AI calls; `node_modules` is absent so no tests were run. The only computation was a scratch re-implementation of
`updateMastery` in plain Node to show trajectories from the code's own default parameters (labelled "computed" below). No usage, retention or
learning-outcome numbers exist in this document, because the repo does not contain any (section 6 gives a measurement plan instead).

Evidence labels: **Verified** (read the code path end to end), **Partially verified**, **Assumption**, **Unknown**. Confidence: HIGH / MEDIUM / LOW / UNKNOWN.
Line numbers are deliberately omitted; function and file names are exact.

## 0. Bottom line

1. **BKT is real, and it does drive one thing: the class map.** `lib/bkt/engine.ts` `updateMastery` is a textbook BKT step with an activity multiplier on the learning rate. `app/api/classes/[id]/map/route.ts` reads `mastery.pL`, builds node status (locked/available/learning/mastered), picks today's focus topic via `lib/teacher/planner.ts` `buildPath`, and the daily challenge (`lib/daily/build.ts` `topicSources`) and tutor prompt read `pL` too. So mastery influences what is shown and suggested. It is not a closed adaptive loop (sections 4 and 5).
2. **The mastery number is not trustworthy as a measure of understanding.** All KCs use default parameters (pL0 0.20, pT 0.15, pG 0.20, pS 0.10); nothing is ever fitted. Computed from those defaults: three correct answers in a row take pL from 0.20 to 0.98 (>= 0.95 "mastered", +100 XP). A pure random clicker on 4-option MCQs reaches 0.95 at a median of about 50 items, and within 10 items about 10 percent of the time (computed, 2000 simulated runs). There is no forgetting, no item identity, no latency, no hint or attempt weighting.
3. **A self-reported "I knew it" button can mint mastery.** `POST /api/evidence` accepts `{classId, kcId, activity:"flashcard", correct}` straight from the browser with no card id. Three calls with `correct:true` reach pL 0.98 (flashcard omega 1.25) and the +100 XP bonus. The 30/day/KC cap bounds volume, not correctness.
4. **FSRS and BKT are two disconnected systems.** `app/api/flashcards/review/route.ts` never calls `applyEvidence`. Class-topic flashcards (topic page) feed BKT but are not scheduled by FSRS. `mastery.stability` and `mastery.nextReviewAt` are never computed (only passed through as defaults), so the "review due" branch in `nextBestActivity`, the map's `due_review` status and `/api/me/learner-state`'s review queue never fire. Mastery never decays.
5. **The misconception resolution loop is broken as coded.** Correct answers call `trackMisconception` with label `general_kc_accuracy`, which writes a different document than the misconception that was diagnosed, so real misconceptions never resolve, while a junk `general_kc_accuracy` document is created (and shows to the tutor as an "open misconception" until its second correct answer). `kcMisconceptionCatalog` and `classSignals` exist only in `firestore.rules`; no code reads or writes them.
6. **Learner DNA is mostly synthetic telemetry.** Dwell time defaults to constants (75 s correct, 115 s wrong) unless a caller supplies it; only the past-questions page and `/api/study/telemetry` do. "Pace profile" is therefore largely a function of correctness. Field names read by `loadLearnerDna` (`correctCount`, `attemptCount`) do not match what `applyEvidence` writes (`correct`, `attempts`). The "cohorts" are learning-style groupings, for which the evidence base is weak.
7. **The platform measures engagement and model-internal mastery, not learning.** No pre/post, delayed or transfer test exists. Weekly "mastery gain" is `pLAfter - pLBefore` of the same model.

## 1. BKT and mastery

### 1.1 What a knowledge component is

Finding: A KC is a **topic** (one lesson unit), stored at `classes/{classId}/kcs/{kcId}` with `title`, `objectives`, `prerequisiteIds`, `bkt` params, `status`, `week`, `difficulty` (`lib/teacher/kcStore.ts` `createKc`/`updateKc`/`upsertAiKc`). KCs are produced by the AI class builder or a teacher, not by a skill-level cognitive task analysis.
Status: Verified. Confidence: HIGH.
Impact: A topic is coarse (a lesson with many sub-skills and several misconceptions). One probability per topic conflates them, so "mastered" means "answered enough topic questions correctly", not "can do every skill in the topic". Quiz questions carry only a loose `focus` tag (conceptual/calculation/application) in `lib/practice/bank.ts`; there is no question-to-sub-skill mapping.
Recommendation: Keep topic-level KCs for the map; add an optional per-question `skillTag` and compute mastery per tag only where a bank is big enough to support it. Do not attempt a full KC model now.

### 1.2 Initialisation, priors, parameters

- `DEFAULT_BKT_PARAMS = { pL0: 0.20, pT: 0.15, pG: 0.20, pS: 0.10 }`; `MASTERY_THRESHOLD 0.95`, `STRUGGLING 0.40`, `STRONG 0.85`, `PREREQUISITE_UNLOCK 0.70` (`lib/bkt/engine.ts`).
- `safeBktParams` rejects values outside (0,1) and falls back to defaults when `pG + pS >= 1` (identifiability guard). Good hygiene; guess/slip are bounded, not estimated (Beck and Chang 2007 on identifiability, see refs).
- Per-KC parameters live on the KC doc and are read inside the `applyEvidence` transaction. Nothing in the repo estimates them (no EM, no grid search, no use of response logs). **All parameters are defaults per KC; there is no learner personalisation** (no per-student pL0, pT or slip).
- Guess is 0.20 for every item, but quiz/diagnostic items are 4-option MCQs (random guess 0.25) and piece/sim checks allow up to 6 options (`selectedOptionIndex` max 5 in the check routes). One pG for all item types is wrong in both directions.
- Initial mastery: `pLPrev = mastery.pL ?? kc.bkt.pL0`. The diagnostic (`app/api/diagnostic/[sessionId]/answer/route.ts`) and the reading signal (`app/api/classes/[id]/read/signal/route.ts`) also write `pL` directly (1.5, 1.6).

Status: Verified. Confidence: HIGH. Impact: thresholds and trajectories depend entirely on unfitted defaults. Recommendation: see 1.8.

### 1.3 Learning transition and the update

`updateMastery(pLPrev, correct, p, activity)`: Bayes posterior on the evidence, then `next = post + (1 - post) * min(1, pT * omega)`, clamped to [0.0001, 0.9999]. `OMEGA = {quiz 1.0, flashcard 1.25, lab 1.75, peer_explain 2.0}`.

- The omega multiplier is this codebase's own addition, not part of standard BKT; there is no evidence in the repo for the constants.
- The learning step is applied after every observation including wrong ones (standard BKT).
- Consequence: **a lab/sim check question (one MCQ) is weighted 1.75x a quiz question.** The sim check (`simulation/check/route.ts`) and piece check (`pieces/check/route.ts`) grade a single guessable MCQ yet earn the second highest learning rate.
- Computed trajectories from pL 0.20, all-correct: quiz 0.60, 0.89, 0.98 (3 items); flashcard 0.62, 0.90, 0.98; lab 0.65, 0.92, 0.99. One wrong lab answer from 0.20 gives 0.28 (the learning step offsets most of the penalty).
- Computed random guessing at p = 0.25 (quiz): median 50 items to reach 0.95; 10th percentile 10 items; about 6 percent had not reached it by 200 items. A 50 percent guesser: median 9 items. With the lab omega at 25 percent guessing: median 24 items.

Status: Verified (code) / computed (numbers, from replicating the formula; not usage data). Confidence: HIGH on the formula, MEDIUM on the simulated medians.
Impact: The model is optimistic. Three right answers produce a "mastered" badge, a +100 XP bonus, a notification and a share to the social feed (`applyEvidence` tail: `notify`, `shareAchievement`). Pure guessing succeeds three times in a row only 1.6 percent of the time per attempt, but retries over a shared bank are cheap.
Recommendation: Gate "mastered" on evidence breadth, not only pL (1.8).

### 1.4 How evidence reaches mastery (trace)

Assessment -> evidence -> BKT -> storage -> consumers:

1. Quiz: `app/api/ai/quiz/route.ts` builds a session from the stored per-topic bank (`lib/practice/bank.ts` `pickForLearner`, unseen first, `reshuffleOptions`) and writes `quizSessions/{id}` including the answer key. `app/api/quiz/[sessionId]/answer/route.ts` locks each question in a transaction (so no double-score races), then calls `applyEvidenceIfEnrolled(activity:"quiz", correct)`.
2. `lib/evidence/apply.ts` `applyEvidence` runs one Firestore transaction: enrolment check (`enrollments/{classId}_{uid}` status active), read KC params, read `mastery/{uid}_{kcId}`, apply the per-day flashcard cap and the per-10-minute lab cap, compute `pLAfter`, XP and streak, write `mastery`, append an immutable `evidence` doc `{uid, classId, kcId, activity, correct, omega, pLBefore, pLAfter, xpEarned, metadata, createdAt}`, update `users` XP/streak. Gamification (`trackProgress`) and notifications run after commit.
3. `applyEvidenceIfEnrolled` also fire-and-forgets `recordAdaptiveSignal` (Learner DNA telemetry).
4. Consumers of `mastery.pL`: class map and `buildPath` (`map/route.ts`, `replan/route.ts`), heatmap (`heatmap/route.ts`), tutor system prompt (`lib/teacher/orchestrator.ts`), daily challenge topic choice (`lib/daily/build.ts`), Learner DNA, evaluation (`lib/evaluation/evidence.ts`), weekly report (`lib/report/compute.ts`), `/api/me/learner-state`.

Status: Verified. Confidence: HIGH. Quiz evidence is **recorded correctly and atomically** (idempotent per question, enrolment checked, correctness graded server-side from the stored key). It is correct as bookkeeping; it is not correct as measurement (1.3, 1.7).

Evidence-quality gaps in the log: `metadata` holds `sessionId`, `questionIndex`, `selectedOptionIndex` but not the stable question id (`BankQuestion.id`), the item difficulty/focus, response time, hint use, or attempt number. Refitting BKT or detecting repeated items later requires joining `quizSessions` (which stores the questions) with `evidence`. Lab/flashcard evidence has no item identity at all.

### 1.5 Multiple-KC updates

Only the diagnostic propagates across KCs. `lib/bkt/propagate.ts` `propagateDiagnosticAnswer` adds up to +0.15 to all transitive prerequisites on a correct answer and subtracts up to 0.15 from all transitive dependents on a wrong one, bounded 0.95/0.05. This is a heuristic, not a Bayesian network update. Ordinary activity (quiz, lab, flashcard) updates exactly one KC. Prerequisite structure is used only for unlocking (>= 0.70) and ordering (dependent counts), never for inference.

Defects found in the diagnostic path (Verified by reading):
- **Overwrites real mastery.** `diagnostic/[sessionId]/answer/route.ts` step 4 does `batch.set(mastery/{uid}_{otherKc}, {pL: propagated value}, {merge:true})` for every non-answered KC in the session map. The session map starts from `kc.bkt.pL0` (`diagnostic/start/route.ts`), not from stored mastery. A student who retakes the diagnostic after learning can have real pL values for other topics reset to prior-derived values. There is no retake guard. HIGH.
- **Question-to-KC attribution trusts model array order.** `diagnostic/start/route.ts` assigns `sampleKcs[idx % sampleKcs.length]` to `data.questions[idx]`; the schema has no KC id per question. If the model reorders or drops one, evidence is written to the wrong KC. MEDIUM-HIGH.
- Only the first 10 KCs of a class are diagnosed (`rawKcs.slice(0, 10)`), one item per KC, so a per-KC estimate rests on a single 4-option MCQ plus the propagation heuristic.
- The diagnostic and the map route call `generateStructuredJson` from `lib/gemini/client` directly, not `generateWithFallback` with a task in `lib/ai/tasks.ts`. Outside this slice, but contrary to the project rule in CLAUDE.md.

### 1.6 Weak-evidence handling

- Reading: `read/signal/route.ts` writes `pL` directly: `page_turn`, `term_explore`, `interactive_play`, `check_pass`, `chapter_complete` raise `pL` by 0.012 to 0.06 with ceilings 0.38 to 0.52; XP is daily-capped (60). These events are **client-reported** (`check_pass` is not verified server-side; `earnedReading` only requires `readingPages >= 2`, itself incremented by client `page_turn`). Bounded and intended as a gentle prior, but it moves the number the map and `nextBestActivity` use (0.48 is the lab threshold) without any assessed evidence, and it becomes the prior for later BKT updates.
- Lab verify (`app/api/labs/verify/route.ts`, `lib/labs/verify.ts`): the browser sends `parameters` (voltage, resistance, ...) and the server checks that they satisfy a closed-form target. It does not verify that the lab was run, only that the submitted numbers are right; anyone who can compute (or read the target) can POST them. Failure returns 422 with **no negative evidence**, so retries are free and lab evidence is monotone upward. A pass is stored as `correct:true` at omega 1.75.
- Quest completion (`quests/complete/route.ts`) is the better design: credit computed from server-recorded `run.firstTry`/`solved`, once per quest version, `correct = firstTry/total >= 0.6`.
- Peer credit (`app/api/lounge/rooms/[roomCode]/credit/route.ts`): any room member can credit another once per pair per room: `correct:true`, omega 2.0, +40 XP. No judging of the explanation, so two accounts can credit each other. MEDIUM risk; mitigated only by the per-pair doc and room membership.
- Defect: `pieces/check/route.ts` and `simulation/check/route.ts` call `applyEvidence` (not the `IfEnrolled` variant) and do not catch `LAB_RATE_LIMITED`. A second check inside the 10-minute lab window throws 429 after the student answered, so the response carries no correctness or explanation. `quests/complete` handles this case explicitly; these two do not. Verified. HIGH.

### 1.7 Anti-gaming: understanding vs guessing, memorising, clicking, copying, fast completion, repeats

| Behaviour | Detected? | Evidence |
| --- | --- | --- |
| Random clicking | No. A 25% guesser still advances (median 50 items). Wrong answers cost little because the learning step offsets them. | `updateMastery` |
| Fast completion | No. `quizSessions.answered[i].answeredAt` is stored but never read; `applyEvidence` takes no latency; dwell constants in `recordAdaptiveSignal` are defaults. | quiz answer route, `learner-dna.ts` |
| Repeated attempts / memorising the key | No. The answer route returns `correctIndex` and the explanation immediately. The bank is about 60 items (`QUIZ_BANK_TARGET`); once exhausted `pickForLearner` serves oldest-seen first with reshuffled options, so memorised stems count as fresh independent evidence. Sessions are unlimited (20 per minute rate limit). | `lib/practice/bank.ts`, quiz routes |
| Copying / shared answers | No. One shared bank per topic for the whole class; variation is only order and option shuffle. | `ensureQuizBank` |
| Self-reported flashcards | Not verified at all (Bottom line 3). | `app/api/evidence/route.ts` |
| Farming | Partly: flashcards 30/day/KC; full XP for the first 5 cards/KC/day; labs 1 per 10 min/KC; reading XP 60/day; `masteryBonusAwardedAt` makes the +100 XP once per KC lifetime (`docs/DECISIONS.md` Decision 8). These protect XP and leaderboards, **not pL itself**: pL rises on every accepted event. | `apply.ts` |
| Wheel-spinning (practice without progress) | No signal. `attempts` and `correct` exist but are not used to flag it (Beck and Gong 2013). | |

Status: Verified. Confidence: HIGH. Net: the platform prevents double-scoring and XP farming, but cannot distinguish guessing, memorising or clicking from understanding.

### 1.8 What is missing to make mastery trustworthy (ordered by value per cost)

1. Remove self-report as pL evidence: server-side card id and verifiable grading, or give self-rated flashcards zero BKT weight (keep for FSRS). Cost: small. Closes the cheapest exploit.
2. Evidence-breadth gate for "mastered": pL >= 0.95 AND at least N distinct item ids AND at least 2 distinct days AND at least one previously unseen item; store `itemId`, `focus`, `difficulty`, `latencyMs`, `hintsUsed`, `attemptIndex` in `evidence.metadata`. Cost: small-medium.
3. Latency floor and guess flag: mark answers faster than a plausible read time as low-weight (Baker, Corbett and Koedinger 2004 used timing and help patterns to detect gaming). Needs `servedAt` per question on the session doc (currently only a session `createdAt`). Cost: small.
4. Decay: a forgetting hook, or tie to FSRS stability, so mastered topics are re-checked (section 2). Cost: medium.
5. Item-type-specific guess (1/k options) and parameters fitted offline from the `evidence` log once item ids are logged (Baker, Corbett and Aleven 2008; Pardos and Heffernan 2010). Cost: medium; defer until items have been logged for a few weeks.
6. Present uncertainty: show "estimated" and an evidence count to students and teachers. Today students see `pL` as a percentage and a "mastered" status; the heatmap shows `pL`, `attempts`, `correct` only. Cost: small.
7. Make omega a flag (cap `peer_explain`/`lab` until validated) so it can be tested; `lib/experiments` is a physics-lab module, not an A/B framework.

## 2. FSRS (ts-fsrs 5.4.2)

Integration facts (Verified, HIGH unless stated):
- Scheduler: `lib/fsrs/scheduler.ts` wraps `ts-fsrs` with `generatorParameters({enable_fuzz:true, enable_short_term:true})`: **default parameters and default desired retention**; nothing is personalised or optimised. `lib/flashcards/serde.ts` stores and rehydrates the card state (`due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review`) on `flashcards/{id}.fsrs` as ISO strings.
- Rating: four self-rated buttons (again/hard/good/easy) POSTed to `app/api/flashcards/review/route.ts` (rate limit 240 per 10 min), card ownership checked, `ref.update({fsrs})` (not in a transaction; low risk, single-user doc), `flashcardStats/{uid}` counters incremented, `trackProgress(flashcards:1)`.
- Intervals/overdue: due cards are selected by `isDueStored`; review mode returns at most 30 due cards sorted soonest-due first (`app/api/flashcards/[deckId]/route.ts`). That is a due-date queue per deck; it is not prioritised by retrievability or by KC mastery, and not across decks.
- **No review log.** The rating, elapsed time and response time are not persisted for personal decks (`flashcardStats` holds only counts by day). A `reviewLogs` subcollection exists only for the Worlds feature (`app/api/worlds/[worldId]/progress/route.ts`). Without logs FSRS parameters cannot be optimised and retention cannot be measured.
- No suspend/bury or per-card disable (only add card and delete deck). No response-time capture.
- Reviews do **not** update BKT or any KC. Personal-deck cards generated from class content (`resolveSource` kind "class" -> `loadKcGroundingContext`) are stored as `{uid, deckId, front, back, fsrs}`; `kcId`/`classId` are dropped (the `Flashcard` type in `lib/cards/types.ts` has them but is unused). A join to mastery is impossible without a migration.
- Parallel flashcard flows: (a) class-topic flashcards from the topic bank (`lib/practice/bank.ts`) with a know/don't-know button -> `/api/evidence` -> BKT, **no spacing**; (b) personal decks -> FSRS, **no mastery**. A third system, Worlds (`lib/worlds/memory.ts`), schedules knowledge units with FSRS and derives its own "mastered" (stability >= 21, 3 successes, 2 templates), a stricter rule than the BKT one and independent of it.
- `mastery.stability` (default 1.0) and `mastery.nextReviewAt` (null) are carried through `applyEvidence` unchanged and never computed. Readers: `nextBestActivity` ("review" if `nextReviewAt` is due and pL >= 0.5), map `due_review`, `/api/me/learner-state`. Because nothing sets `nextReviewAt`, those branches are dead. Also `buildPath` calls `nextBestActivity({pL})` without `nextReviewAt` and skips pL >= 0.90 before choosing an activity, so "review" is unreachable there even in principle.
- Duplicates: `cleanCards` dedupes by lower-cased front within one generation only; no cross-deck or regeneration dedupe; limits 20 decks, 100 cards per deck, 8 generations per hour.
- Grounding: generation uses class material via `loadKcGroundingContext` (6000 character budget, 12000 cap) with `fenceUntrusted` prompt text, so it is grounded in the class. Cards store no page/chunk reference and the deck stores only a text `sourceLabel`, so a teacher cannot audit a card against its source and nothing verifies the answer appears in the source. MEDIUM.

Conflict between FSRS and the mastery engine: none at runtime, because they never meet. The conceptual conflict is the real risk: BKT says "mastered, never revisited" (no decay) while FSRS would say "due in 3 days". A student can be "mastered" on the map and failing the same topic's cards.

Recommendation (extend, do not rebuild): (1) add `kcId`/`classId` to generated cards and write an FSRS review log; (2) set `mastery.nextReviewAt` from the soonest-due card for that KC so the dead review branch comes alive; (3) do not let self-rated "Good" raise pL (self-report again); use FSRS lapses only to lower confidence or trigger a re-check quiz.

Research basis: spaced practice (Cepeda et al. 2006) Strong; testing effect (Roediger and Karpicke 2006) Strong; FSRS has a published scheduling paper and community benchmarks (Ye, Su and Cao 2022; open-spaced-repetition project) Moderate. Default weights are population averages and a reasonable start; personalised optimisation needs a review log and many reviews per learner (my hypothesis: hundreds).

## 3. Mistakes and misconceptions

### 3.1 Mistake notebook (`lib/mistakes/*`, `mistakes` collection)
- `recordMistake` is called on wrong quiz answers and wrong daily-challenge answers; the id is a hash of `uid` + question text, so repeats update one entry (`wrongCount`).
- Retest (`app/api/study/mistakes/[id]/route.ts`): re-asks the **same question**; two correct in a row marks it `mastered`. This measures recall of a previously shown key (the retest endpoint withholds the answer from the list view with `retest=1`, good), not understanding, and it **does not update BKT**. The evaluation and daily challenge treat `mastered` as fixed.
- Daily challenge (`lib/daily/build.ts`) does better: for mistake items the model writes a *new* question on the same concept; the top-up chooses weakest topics by `pL`. But daily answers (`app/api/study/daily/answer/route.ts`) do not call `applyEvidence` (only `recordMistake`, XP and streak), so a correct daily answer on a weak topic does not raise its mastery.
- Status: Verified. HIGH.

### 3.2 Misconception detection and resolution
- Detection sources: (a) quiz and diagnostic questions carry `distractorMisconceptions[]` (AI-written label per wrong option) -> `trackMisconception({label, isCorrect:false})`; (b) the tutor can end a reply with `[[misconception: label]]` (`lib/teacher/orchestrator.ts`), then `trackMisconception`.
- Storage: `misconceptions/{uid}_{kcId}_{sanitizedLabel}` `{occurrences, consecutiveCorrect, resolved, ...}`; resolved after 2 consecutive corrects (`evaluateMisconceptionTransition` in `lib/teacher/misconceptions.ts`).
- **Resolution bug (Verified, HIGH):** on a correct answer, the quiz and diagnostic routes call `trackMisconception({label:"general_kc_accuracy", isCorrect:true})`. The doc id is `${uid}_${kcId}_general_kc_accuracy`, so the correct answer advances a *different* document and never touches the diagnosed misconception, which stays `resolved:false`. The code comment says "Advance resolution for any existing diagnosed misconception for this KC"; the implementation does not do that. Side effects: a junk `general_kc_accuracy` doc is created per student per KC; it appears in `/api/me/learner-state` open misconceptions and in the tutor's "Open misconceptions" line (`orchestrator.ts` queries `resolved == false` without excluding it) until its second correct answer; Learner DNA explicitly filters that label out, which suggests the authors knew.
- Even if fixed, the criterion is "2 correct answers on any question in the KC", not "a question targeting the same misconception with its distractor available and avoided". That is a weak resolution test: a student can answer an unrelated easy item correctly while still holding the misconception.
- Label quality is unverified: AI-generated with the question; no human-curated catalog. `kcMisconceptionCatalog/{catalogId}/items/{itemId}` appears only in `firestore.rules` (read: any authenticated user; write: false). No code reads or writes it. So there is **no curated catalog, no label normalisation across students and no class-level aggregation** (e.g. "40 percent of the class chose the 'current is consumed' distractor"). `classSignals/{classId}` is likewise rules-only. The teacher heatmap shows `pL` only, no misconception counts. Verified by grep over `app lib components`. HIGH.
- `diagnosticSessions` is a working placement flow writing `learnerProfiles.diagnosticResults[classId]` (average starting pL, counts, suggested first KC); see 1.5 for defects. The map route reads `learnerProfiles.goals` but not `diagnosticResults`, so the stored `suggestedFirstKc` steers nothing except through the pL values it wrote.

Evidence note: distractor-driven diagnosis is well established where distractors come from researched misconceptions (concept inventories such as the Force Concept Inventory, Hestenes, Wells and Swackhamer 1992, Strong). AI-invented distractor labels are Emerging at best and need validation against student response data.

Recommendation: (1) fix resolution: store the targeted `misconceptionLabel` on the question, and on a correct answer resolve/advance only misconceptions whose label the question targets; stop writing `general_kc_accuracy`; (2) one-off cleanup of existing junk docs; (3) aggregate per class per KC the `occurrences` by label for the lecturer view (a read-time query is enough; no catalog needed yet).

## 4. Learner DNA (`lib/adaptive/learner-dna.ts`, `lib/learning/telemetry.ts`) and evaluation (`lib/evaluation/*`)

### 4.1 What is measured
- Telemetry on `users/{uid}.telemetryProfile`: `applyTelemetryEvent` keeps per-topic/formula friction, `avgDwellRatio` (dwell vs a peer median), cohort weights, `predictedExamReadiness` (initial 42, floor 25, cap 98) and `predictedWeeklyGain`.
- `buildLearnerDna` (pure, deterministic) combines telemetry with `mastery`, `misconceptions`, `mistakes` into a dominant "cohort" (four style groups: step-by-step, visual-intuitive, example-driven, first-principles), `paceProfile` (fast_rusher / deliberate_steady / deep_struggler), `recommendedScaffold`, struggling/mastered topics, weak formulas and active misconceptions.

### 4.2 Problems (Verified unless noted)
- **Dwell is mostly synthetic.** `recordAdaptiveSignal` uses `defaultDwell = correct === false ? 115000 : 75000` and `peerMedianMs` 90000 when the caller omits them. `applyEvidenceIfEnrolled`, `/api/evidence`, quiz answer and the tutor pass no dwell, so `avgDwellRatio` is mostly a function of correctness (about 0.83 vs 1.28). `inferPaceProfile` ("fast_rusher", "deep_struggler") is therefore close to an accuracy label. Real dwell exists only in `past-questions/page.tsx` and `/api/study/telemetry`. HIGH.
- **Schema mismatches.** `loadLearnerDna` reads `data.correctCount` and `data.attemptCount`, but `applyEvidence` writes `correct` and `attempts`; it reads `kcTitle`, which `applyEvidence` never writes. Result: accuracy falls back to a readiness-derived number, `totalSignals` leans on telemetry, and topic names in the injected prompt degrade to raw kcIds (`title || topic || kcId`). HIGH.
- **Readiness is not a prediction.** `predictedExamReadiness` is an incrementally nudged heuristic starting at 42, not fitted to exam outcomes. `app/api/schools/route.ts` shows it to school managers as `predictedReadiness`, flags `atRisk = readiness < 55`, and substitutes constants (65 readiness, 6 weekly gain, 68 school average) when absent. That is presentational, not evidential; it should not inform decisions about students. HIGH.
- **Learning styles.** The cohort personalisation ("Visual and real-world analogy", "Worked number pattern-matching") follows the learning-styles pattern. The matching hypothesis (teach each learner in their preferred style) lacks support for improving outcomes (Pashler et al. 2008, Strong). The treatments themselves (worked examples, analogies, micro-steps, edge cases) are reasonable and their suitability depends on expertise (expertise-reversal effect, Kalyuga et al. 2003, Strong), so harm is low; the weak part is the claim of "personalisation by cohort". Prefer scaffolds derived from mastery level and misconception state.
- The misconception list in DNA is built from `where uid == ... limit(25)`, so it can be truncated and includes junk labels (filtered).
- Cache: in-process Map, 90 s TTL, 500 entries; per serverless instance, so DNA can be stale across instances. LOW.

### 4.3 How it feeds prompts and privacy
- `lib/ai/router.ts` `generateWithFallback`: if `shouldInjectLearnerDna(opts)` it appends `buildLearnerPromptInjection(userId)` (<= 1100 characters inside `<PERSONAL_LEARNER_DNA>`) to the system instruction. It applies to tasks in `PERSONALIZED_AI_TASKS` or when `personalize:true`, and **never** with a `cacheKey`, `learnerLanguage:false` (shared class content) or `isPrivileged`; the predicate is unit-tested in `lib/ai/router.test.ts`. One learner's profile therefore cannot leak into a shared cache or another learner's output.
- Content injected: level, cohort label, pace, mastery %, accuracy %, readiness %, topic titles with percentages, misconception labels, formula strings, recent mistake topics. All pass `cleanText` (strips `<>[]`, length limits) so a learner-controlled string cannot close the tag.
- It goes to third-party model providers (Gemini/Groq/OpenRouter) on each call. The consent and data-processing position is **Unknown** from this slice, as is handling of minors' data.
- The tutor separately receives exact `pL`, attempts, correct and open misconceptions in its system prompt (`orchestrator.ts`), outside `shouldInjectLearnerDna`; same privacy consideration.
- No evidence in the repo that the personalisation improves outcomes (no A/B, no measurement). Effect: Unknown.

### 4.4 Student evaluation (`lib/evaluation`, `app/api/study/evaluation/route.ts`)
- Joins wrong answers (`mistakes`) and `mastery` into a per-topic `EvidenceSummary` (`summarize`), gives the model the actual wrong answers beside the correct ones to name the misunderstanding, returns a structured plan (tools: retest, flashcards, notes, lesson, quiz, tutor) with links built only from known topics (`linkFor`), has a no-AI `fallbackEvaluation`, and an evidence signature (`signature.ts`) to avoid regenerating. Well designed: grounded, bounded, safe links, with a fallback.
- Limits: it inherits all mastery weaknesses (inputs are pL and "mastered" mistakes defined by same-item retests); the "misunderstanding" is the LLM's inference from one to three wrong answers, not a measured misconception; nothing tracks whether the plan was followed or helped. Status: Verified. MEDIUM.

## 5. The closed loop (`docs/design/LEARNING-LOOP.md`) versus the code

The document itself lists predict-before-run, interleaving, adaptive hint fading and the animated-lesson engine under "Not built yet". Beat by beat:

| Beat | What the doc says | What the code does | Verdict |
| --- | --- | --- | --- |
| Goal | objectives per chapter; mind map | Objectives exist on the KC. A class goal (`app/api/classes/[id]/goal`: target date, minutes/day, goal type) is saved in `learnerProfiles.goals` and used only by `paceWeeks` and the AI note. A separate `/goals` feature (`lib/goals`, `app/api/goals`) builds dated plans from an AI outline and **does not read mastery**. | Partial: goals set dates, not content. Two unconnected goal systems. |
| Current knowledge | mastery colours | `mastery.pL` per KC; diagnostic placement (one MCQ per KC, first 10 KCs, can overwrite pL). Reading bumps pL without assessment. | Present, low fidelity. |
| Next activity | "recalled most -> quiz; missed some -> flashcards" | The reader's recall -> quiz/flashcards routing is not traced in this slice (Assumption: client-side from the recall score). On the map, `buildPath` orders KCs (unlocked first, most dependents first) and `nextBestActivity` maps pL to learn/quiz/lab/teach_back. **`recommendedPath` with `activity` is returned by the API and stored in React state in `map/page.tsx` but never rendered**; the UI shows node colours, the highlighted "today's focus" node (the first path item) and one AI sentence that cites the activity. "teach_back" has no destination feature. | Real BKT-driven topic choice; activity choice is thin and mostly invisible. |
| Feedback | answer + reason at once | Quiz returns `correct`, `correctIndex`, `explanation` immediately; labs/sims return the explanation from the server-graded check; XP and pL deltas are returned. | Works. Outcome feedback only; no hint ladder or strategy feedback. |
| Adjust | next step depends on the result | pL changes after every evidence event; `pickAdaptiveQuizFocus(dna)` changes the *focus type* of the next quiz (calculation if weak formulas, conceptual if misconceptions or mean < 55, application if mean >= 75) only when focus is "mixed". The daily AI note is **cached per day** (`learnerPlans/{uid}_{classId}_{date}`), so it does not adapt after the learner acts that day. Difficulty is not adapted (`difficulty` is shown, not used for selection). | Partial: topic and quiz focus adjust; difficulty, hints and spacing do not. |

Student-facing next action: (a) today's focus node + AI note, (b) daily challenge (weakest topics by pL, mistake-based), (c) the evaluation plan at `/study/evaluation`, (d) goal tasks. These are four separate surfaces with no single ranked "do this now" merging due reviews, misconceptions, mastery and deadline.

Lecturer visibility (`app/api/classes/[id]/heatmap/route.ts`, teacher/admin only): students x KCs grid with `pL`, attempts, correct, status; per-KC average pL, % mastered, % struggling (< 0.4), three weakest KCs. Limits: `strugglingPercentage` counts **never-started** students (default pL0 0.20 < 0.40), conflating "not started" with "struggling"; no misconception counts; no item-level view (which question, which distractor); no recency beyond `lastUpdated`; `classSignals` is unused. A lecturer can see gaps by topic, not why. Verified.

Lab/quest/sim activity as evidence: yes, only through server-graded check questions (sim check, piece check, quest completion) or the closed-form lab verify. They give modest, guessable evidence (single MCQ) at a high omega. The interactive process (what the learner tried, predictions, errors) is not captured. `LEARNING-LOOP.md` lists predict-before-run as not built; `lib/sim/build.ts` only suggests the check question may be a prediction. So a lab does not yet yield "predicted correctly before seeing the result" evidence.

**Is the loop closed?** Mostly open in practice. There is a path from assessment to a stored mastery number and from that number to topic ordering, quiz focus and prompt text. It is not closed because: (1) the evidence is weak and gameable, (2) reviews and daily answers do not feed the model, (3) misconceptions never resolve, (4) nothing brings mastered topics back (no spacing/decay), (5) the activity recommendation is not shown, (6) nothing measures whether adjustments improved learning.

### 5.1 Usefulness and integration cost of pedagogical features (do not do all of them)

| Feature | Evidence strength | Value here | Integration cost | Verdict |
| --- | --- | --- | --- | --- |
| Retrieval practice | Strong (Roediger and Karpicke 2006; Dunlosky et al. 2013: high utility) | Already the core (quizzes, recall check, flashcards) | Low | Keep; make it the evidence source and fix gating. |
| Spacing / delayed review | Strong (Cepeda et al. 2006) | FSRS exists but is disconnected | Low-Medium: add `kcId` to cards, write `nextReviewAt` | **Do first.** |
| Error correction / misconception repair | Moderate for feedback (Hattie and Timperley 2007); Emerging for AI-generated misconceptions | Notebook and tracker exist; resolution broken | Low (fix bug) | **Do first.** |
| Delayed retention measurement | Strong as a method | Cheap: schedule a short re-quiz of earlier-mastered items at 7 and 30 days | Low-Medium | **Do first** (it is the measurement the platform lacks). |
| Confidence calibration | Moderate (Bjork, Dunlosky and Kornell 2013); Emerging for classroom effect | One extra tap per quiz item ("sure / unsure") also separates guess from knowledge | Low | Worth adding to quizzes; also improves BKT (low-confidence correct = weaker evidence). |
| Predict-before-run in labs | Moderate (White and Gunstone 1992; Crouch et al. 2004) | Fits sim/lab; gives less guessable evidence | Medium (prompt contract in `lib/sim/build.ts` + a server-recorded prediction) | After the above; one lab type first. |
| Worked examples / fading | Strong for novices (Sweller; Renkl and Atkinson 2003; Kalyuga et al. 2003) | Content is AI-generated per chapter; fading needs a mastery signal (exists) | Medium | Cheap form: show a worked example when pL < 0.4, move to problems when pL > 0.7. |
| Adaptive hint fading | Moderate (Aleven and Koedinger 2002) | Needs a hint ladder first; none in quizzes, quests have one hint | Medium-High | Defer. |
| Interleaving | Moderate (Rohrer and Taylor 2007; Kornell and Bjork 2008) | Quizzes are single-KC; mixed review needs cross-KC banks; daily challenge already mixes topics | Medium | Defer. |
| Elaborative interrogation / self-explanation | Moderate (Dunlosky 2013; Chi et al. 1994) | Tutor and "peer explain" exist; credit is unjudged | Medium (needs an LLM grader) | Defer; if built, grade explanations server-side, never auto-credit. |
| Transfer | Strong need, hard to measure | No transfer items; `focus: application` is the nearest | Medium-High | Report `application` items separately; a cheap first step. |
| Declarative animated lessons (`docs/design/INTERACTIVE-LESSON-ENGINE.md`) | Multimedia principles Strong-Moderate (Mayer); benefit of this specific engine Unknown | Spec only ("not built yet"); large effort (schema, runtime, authoring, QA) | High | Do not start before the evidence and measurement fixes; it changes content, not whether you can tell it works. |

## 6. Does it measure learning, or only engagement?

Data that exists (Verified by collection and field):
- `evidence` (append-only): per-event correctness, activity, `pLBefore/pLAfter`, timestamps. Reads are capped in places (`admin/usage` samples 500 docs; `lib/report/server.ts` and `lib/activity/server.ts` read 1500 per user).
- `mastery`: current pL, attempts, correct, lastPracticedAt, per-day counters.
- `quizSessions`: items served, answers, `answeredAt`; `practiceHistory` (items seen).
- `mistakes` (wrongCount, retestCorrect), `misconceptions` (occurrences, resolved: unreliable, see 3.2), `diagnosticSessions` and `learnerProfiles.diagnosticResults` (a placement snapshot per class, the closest thing to a pre-test).
- `flashcards.fsrs` current state (no history), `flashcardStats` (daily counts), Worlds `reviewLogs`.
- `users`: xp, streak, `lastActiveDate`, `telemetryProfile` (study time, readiness heuristic).
- Admin "north star" (`app/api/admin/usage/route.ts`): weekly "verified learners", "verified mastery events" (counts `correct === true` or `pLAfter >= 0.8` in a 500-doc sample), 7-day retention (proxy: last active within 7 days **or any streak > 0**), lab completion proxy. These are engagement counters, partly sampled; "verified mastery events" overstates what is verified.

Cannot be measured today:
- Learning gain (pre/post): the diagnostic is one MCQ per KC, is not repeated or compared, and a retake overwrites state.
- Delayed retention: no scheduled re-test of mastered items; no FSRS logs for personal decks.
- Transfer: no transfer-tagged items.
- Time to mastery: only coarsely (first evidence to first `pLAfter >= 0.95`), and pL >= 0.95 is gameable, so the metric is contaminated.
- Misconception resolution rate: unreliable (bug).
- Dropout: partial (last activity), no funnel by cause.
- Time on task: only where dwell is real (past questions).
- Effect of features (labs, AI tutor, DNA, FSRS) on outcomes: no randomisation, holdout or flag mechanism.

How to separate "more time" from "more learned" (measurement plan; no numbers are claimed):
1. Define an independent outcome: a fixed **probe set** per KC (for example 4 items kept out of the practice bank, different surface forms), given (a) at diagnostic/pre, (b) at "mastered", (c) 7 and 30 days later. Outcome = probe score, not pL.
2. Log for every item: itemId, focus/difficulty, `servedAt`, `answeredAt`, hints, attempt index, confidence tap.
3. Compare learning per unit time: probe gain divided by minutes (session spans), not raw XP or streak.
4. Run cheap holdouts: for example 10 percent of learners without Learner DNA injection or without the quiz-focus nudge; or a stepped rollout of FSRS-driven review by class. Compare probe outcomes at 30 days. Needs a flag mechanism (a hash of uid against a config value suffices).
5. Test predictive validity of pL: compare pL at "mastered" against 30-day probe correctness (for example AUC). If near chance, pL is not a learning measure.
6. Report to teachers: per KC, probe gain, 30-day retention, and share of the class with an unresolved misconception per label.

## 7. Explicit answers

- **Is BKT genuinely driving recommendations?** Yes for: map statuses, the single "today's focus" node and the sentence about it, daily-challenge topic selection (weakest `pL` first), quiz focus (via DNA, from mean mastery) and the tutor prompt. No for: the activity recommendation (computed, not displayed), review timing (dead), difficulty, hints. It drives *which topic*, loosely *which quiz type*, and not *what exact activity or when to revisit*.
- **Does FSRS work independently or with BKT?** Independently only. FSRS schedules personal decks and Worlds cards with default parameters; it never reads or writes mastery, and BKT never reads FSRS state. Personal-deck cards carry no KC link.
- **Does quiz evidence update mastery correctly?** Mechanically yes (atomic, enrolment-checked, idempotent per question, server-graded). Epistemically no: the update is optimistic (3 correct = mastered), one parameter set, repeated items count as new, no latency, no per-item guess.
- **Can lab activity give meaningful evidence?** Weakly today. Sim/piece checks are one MCQ each with a high omega; lab verify checks submitted parameters but not that the lab was run, and failures are not recorded; quests are best (server-recorded first-try results). Meaningful lab evidence needs server-recorded prediction vs outcome and several items.
- **Can it detect repeated guessing?** No. No latency use, no confidence, no attempt-pattern or item-repeat awareness; random clicking eventually earns mastery.
- **Can it identify misconceptions?** Partially: it records the AI label attached to the chosen distractor and tutor-flagged labels. It cannot resolve them (bug), cannot aggregate them for the lecturer, and has no validated catalog.
- **Can it recommend the next best activity?** It recommends the next *topic* reasonably and picks a quiz focus. It does not surface a ranked, explained next action combining due reviews, misconceptions, mastery and deadline.
- **Can it measure retention and transfer?** No (section 6).
- **What is missing for a genuinely adaptive system?** (i) trustworthy evidence (verified, item-level, latency, confidence), (ii) forgetting/spacing tied to mastery, (iii) a misconception loop that actually closes, (iv) one ranked next-action surface, (v) an outcome measure independent of pL, (vi) basic parameter fitting from logs, (vii) experiment flags to learn what works.
- **Which existing engine should be extended first?** **The evidence pipeline (`lib/evidence/apply.ts` plus BKT)**, because the map, daily challenge, DNA, evaluation, report and teacher heatmap all consume `mastery.pL`; making that number honest improves all of them. Specifically: log item-level metadata, remove self-report as pL evidence, add the breadth gate, then link FSRS due dates into `nextReviewAt`. FSRS is second (cheap once cards carry `kcId`). Do not extend Learner DNA or build the lesson engine first.

## 8. Prioritised recommendations (smallest sufficient set)

| # | Change | Why | Cost | Confidence |
| --- | --- | --- | --- | --- |
| 1 | Make `/api/evidence` flashcard events non-mastery (or remove) | Cheapest exploit; self-report | S | HIGH |
| 2 | Log `itemId, focus, difficulty, servedAt/latency, hintsUsed, attemptIndex, confidence` into `evidence.metadata`; add per-question `servedAt` to `quizSessions` | Enables detection, fitting and the measurement plan | S-M | HIGH |
| 3 | Mastery gate: pL >= 0.95 AND >= N distinct items AND >= 2 days | Stops 3-click mastery | S | HIGH |
| 4 | Fix misconception resolution (target-specific); stop writing `general_kc_accuracy`; clean junk docs | Loop currently broken | S | HIGH |
| 5 | Catch `LAB_RATE_LIMITED` in sim/piece checks | User-visible defect | XS | HIGH |
| 6 | Diagnostic: never overwrite existing mastery; return per-question `kcId` from the model; block retakes or blend with existing pL | Data corruption risk | S | HIGH |
| 7 | Add `kcId/classId` and a review log to FSRS cards; set `mastery.nextReviewAt` from FSRS | Brings review, `due_review` and the "review" branch to life | M | MEDIUM-HIGH |
| 8 | Render `recommendedPath` with activity and reason on map/dashboard; compute activity from misconceptions and due reviews | The decision exists but is hidden | S-M | HIGH |
| 9 | Delayed-retention probe at 7 and 30 days; held-out probe items per KC | The missing outcome measure | M | HIGH |
| 10 | Heatmap: separate "not started" from "struggling"; add top misconception labels per KC | Lecturer actionability | S-M | HIGH |
| 11 | Fix `loadLearnerDna` field names; treat unknown dwell as null; stop presenting `predictedExamReadiness` as a prediction | Honesty of the data | S | HIGH |
| 12 | Confidence tap on quiz items | Guess vs knowledge, calibration | S | MEDIUM |

## References

Original sources. "Accessed 2026-11-19" is the date this audit cited them; the URLs and findings come from memory and were NOT re-fetched during this read-only audit, so verify before external use. Evidence strength: Strong / Moderate / Emerging / my hypothesis.

1. Corbett, A. T., and Anderson, J. R. (1995). Knowledge tracing: Modeling the acquisition of procedural knowledge. User Modeling and User-Adapted Interaction 4. https://doi.org/10.1007/BF01099821 (accessed 2026-11-19, not re-fetched). Strong (foundational model).
2. Baker, R. S. J. d., Corbett, A. T., and Aleven, V. (2008). More accurate student modeling through contextual estimation of slip and guess probabilities in Bayesian knowledge tracing. ITS 2008. https://doi.org/10.1007/978-3-540-69132-7_44 (accessed 2026-11-19, not re-fetched). Moderate.
3. Pardos, Z. A., and Heffernan, N. T. (2010). Modeling individualization in a Bayesian networks implementation of knowledge tracing. UMAP 2010. https://doi.org/10.1007/978-3-642-13470-8_24 (accessed 2026-11-19, not re-fetched). Moderate.
4. Beck, J. E., and Chang, K. (2007). Identifiability: A fundamental problem of student modeling. UM 2007. https://doi.org/10.1007/978-3-540-73078-1_14 (accessed 2026-11-19, not re-fetched). Moderate.
5. Baker, R. S., Corbett, A. T., and Koedinger, K. R. (2004). Detecting student misuse of intelligent tutoring systems. ITS 2004. https://doi.org/10.1007/978-3-540-30139-4_43 (accessed 2026-11-19, not re-fetched). Moderate.
6. Beck, J. E., and Gong, Y. (2013). Wheel-spinning: Students who fail to master a skill. AIED 2013. https://doi.org/10.1007/978-3-642-39112-5_44 (accessed 2026-11-19, not re-fetched). Moderate.
7. Roediger, H. L., and Karpicke, J. D. (2006). Test-enhanced learning. Psychological Science 17(3). https://doi.org/10.1111/j.1467-9280.2006.00012.x (accessed 2026-11-19, not re-fetched). Strong.
8. Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., and Rohrer, D. (2006). Distributed practice in verbal recall tasks. Psychological Bulletin 132(3). https://doi.org/10.1037/0033-2909.132.3.354 (accessed 2026-11-19, not re-fetched). Strong.
9. Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., and Willingham, D. T. (2013). Improving students' learning with effective learning techniques. Psychological Science in the Public Interest 14(1). https://doi.org/10.1177/1529100612453266 (accessed 2026-11-19, not re-fetched). Strong (review).
10. Pashler, H., McDaniel, M., Rohrer, D., and Bjork, R. (2008). Learning styles: Concepts and evidence. Psychological Science in the Public Interest 9(3). https://doi.org/10.1111/j.1539-6053.2009.01038.x (accessed 2026-11-19, not re-fetched). Strong (for the lack of support for style matching).
11. Kalyuga, S., Ayres, P., Chandler, P., and Sweller, J. (2003). The expertise reversal effect. Educational Psychologist 38(1). https://doi.org/10.1207/S15326985EP3801_4 (accessed 2026-11-19, not re-fetched). Strong.
12. Rohrer, D., and Taylor, K. (2007). The shuffling of mathematics problems improves learning. Instructional Science 35. https://doi.org/10.1007/s11251-007-9015-8 ; Kornell, N., and Bjork, R. A. (2008). Learning concepts and categories: Is spacing the enemy of induction? Psychological Science 19(6). https://doi.org/10.1111/j.1467-9280.2008.02127.x (accessed 2026-11-19, not re-fetched). Moderate.
13. Crouch, C. H., Fagen, A. P., Callan, J. P., and Mazur, E. (2004). Classroom demonstrations: Learning tools or entertainment? American Journal of Physics 72. https://doi.org/10.1119/1.1707018 (accessed 2026-11-19, not re-fetched). Moderate (predict before demonstration).
14. Hestenes, D., Wells, M., and Swackhamer, G. (1992). Force Concept Inventory. The Physics Teacher 30. https://doi.org/10.1119/1.2343497 (accessed 2026-11-19, not re-fetched). Strong as a validated distractor-based diagnostic; says nothing about AI-generated distractors.
15. Ye, J., Su, J., and Cao, Y. (2022). A stochastic shortest path algorithm for optimizing spaced repetition scheduling. KDD 2022. https://doi.org/10.1145/3534678.3539081 ; project: https://github.com/open-spaced-repetition (accessed 2026-11-19, not re-fetched). Moderate.
16. Hattie, J., and Timperley, H. (2007). The power of feedback. Review of Educational Research 77(1). https://doi.org/10.3102/003465430298487 (accessed 2026-11-19, not re-fetched). Moderate.
17. Bjork, R. A., Dunlosky, J., and Kornell, N. (2013). Self-regulated learning: Beliefs, techniques, and illusions. Annual Review of Psychology 64. https://doi.org/10.1146/annurev-psych-113011-143823 (accessed 2026-11-19, not re-fetched). Moderate.
18. Renkl, A., and Atkinson, R. K. (2003). Structuring the transition from example study to problem solving in cognitive skill acquisition. Educational Psychologist 38(1). https://doi.org/10.1207/S15326985EP3801_3 (accessed 2026-11-19, not re-fetched). Moderate-Strong.

Hypotheses (mine, not sourced): that a breadth gate of about N distinct items over 2 or more days materially reduces false mastery; that FSRS personalisation needs on the order of hundreds of reviews per learner; that the omega weights are too high. All should be tested with the plan in section 6, not assumed.

## Open questions

1. Does `lib/teacher/classBuilder.ts` generate `bkt` per KC with anything other than defaults, and can teachers edit them in the UI? (Only `kcStore.ts` was read.)
2. Does the reader's "Close the book" recall step call any server evidence route, or is it purely client-side routing? (Not traced; assumed no BKT evidence.)
3. Which AI tasks are in `PERSONALIZED_AI_TASKS` (list only partially read), and what do provider data-processing terms and consent cover for learner profile data, especially for minors?
4. Is `/api/evidence` called from any client besides the topic page, and how often do learners hit the 30 per day cap? (Needs production data; not available to this audit.)
5. How are quiz question quality and `distractorMisconceptions` validated (`lib/quiz/normalize.ts`, `lib/teacher/qualityCheck.ts` were only skimmed by name)?
6. Should the Worlds mastery rule (stability >= 21, 3 successes, 2 templates) become the model for topic mastery? (Comparison not done.)
7. Is there exam or assignment grade data (`lib/exam`, `assignments`) usable as an external outcome to validate pL against? (Not read in depth.)
8. Production Firestore state: how many junk `general_kc_accuracy` docs exist, and is `nextReviewAt` populated anywhere? (Cannot be checked read-only from the repo.)
9. `docs/design/LEARNING-LOOP.md` cites literature "from memory, not re-checked"; the references above were also not re-fetched. Someone should verify them before any external claim.
