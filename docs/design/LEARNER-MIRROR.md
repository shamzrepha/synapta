# The Learner Mirror and the "For you" feed

A small, deterministic model of **how a learner studies**, used to choose what to show next and how Sprout talks. It models study habits. It never diagnoses personality or ability, and the UI says so.

Principle: **engagement must serve learning.** Need (what the learner should do) always outranks preference (what they enjoy). There is no infinite scroll: the feed has a daily goal and a calm end.

## Where it lives

| Piece | File |
| --- | --- |
| Schemas (signals, stored state, profile) | `lib/mirror/schema.ts` |
| Signal folding and decay | `lib/mirror/signals.ts` |
| Signals to `MirrorProfile` and the map tree | `lib/mirror/profile.ts` |
| Ranker | `lib/mirror/rank.ts` |
| Candidate pool (allowed content only) | `lib/mirror/feed.ts` |
| Sprout voice and prompt addition | `lib/mirror/sprout-style.ts` (server), `sprout-voice.ts` (client-safe) |
| Weekly summary (the only AI call) | `lib/mirror/summary.ts`, `summary-run.ts`, task `mirror_summary` in `lib/ai/tasks.ts` |
| Storage | `lib/mirror/store.ts`, Firestore `learnerMirror/{uid}` |
| API | `/api/me/mirror` (GET, PATCH), `/api/me/mirror/reset` (POST), `/api/me/feed` (GET), `/api/me/feed/signal` (POST) |
| UI | `/for-you`, `/my-learning-map` (`components/mirror/*`) |

## Signals (what is collected)

`start`, `finish`, `skip`, `too_hard`, `too_easy`, `hint`, `retry`, `confidence` (1 to 5), each tagged with a format (flashcards, quiz, lesson, lab, written, podcast). A `finish` may carry dwell time against the expected time, local hour, session minutes and a topic key (becomes an "interest" only after finishing it). Batches are capped at 25 and validated by zod. No answers, messages or free text are stored; topic titles are stripped of markup characters.

## Model

Running counters per format plus hour-of-day, session length, confidence and topic weights, stored in `learnerMirror/{uid}` (owner-only: Firestore rules deny all client access, the server writes it; deleted by `lib/privacy/delete-user.ts` and by "Delete my profile").

- **Decay.** Every counter is multiplied by `0.5^(elapsed / 21 days)` before new signals are added, so old habits fade and the model follows the learner.
- **Format affinity** = `(finishes + 1) / (starts + skips + 2)`, minus a "too hard" penalty. Below 5 observations it is shown as "still learning" and treated as neutral (0.5). Confidence = `n / (n + 5)`.
- **Pace** from the mean dwell/expected ratio (below 0.75 quick, above 1.3 deep), capped per item.
- Also: persistence, hint use, self-reported confidence, best hours, typical session length, interests.
- **Explicit edits win.** "More/Less" per format, pace, example length, encouragement, interests and daily goal override observation (`source: "you_set"`).
- **Off means off.** With personalisation off nothing is collected (signals are dropped server side), the profile is neutral and prefs are ignored. Default is off until the learner turns it on.

## Ranker

For each candidate (due flashcards, weak topics, lessons, labs, written practice, quizzes, podcast clips from enrolled classes, lecturer-published content only, plus the learner's own notes and cards):

```
need    = max(1 - mastery, dueScore)        dueScore: 0.7 + 0.05/day overdue (max 1), 0.4 if due within 2 days
exam    = 1 / (1 + daysToExam / 7) * (0.4 + 0.6 * gap)
pref    = affinity * confidence + 0.5 * (1 - confidence)
explore = eps * (0.6 * novelty + 0.4 * seededRandom)     eps = 0.15 + 0.85 * 0.5^(signals / 60)
score   = 0.60 need + 0.20 exam + 0.12 pref + 0.08 explore - 0.25 (if skipped before)
```

Preference plus exploration add at most 0.20; a high-need item is worth at least 0.30 more than a low-need one, so enjoyment cannot push aside need. Items with need below 0.2 and no near exam are dropped, which is how "you're caught up" arises. Selection is greedy with a diversity rule (no more than 2 of one format in a row, also across calls) and a cap of 8 per session (5 per request). The seed is `uid:day:done:bonus`, so a feed is reproducible. Every item carries a `reason` and a plain `why`.

## Daily goal and the end

Goal = `prefs.dailyGoalItems` (default 6). Progress is counted on the device (localStorage, per day) and sent as query parameters; nothing about it is stored on the server. When the goal is met the feed returns no items and the UI shows "You're done for today" with an optional "Do 3 more".

## Sprout

`sproutStyleFrom(profile)` gives `maxWords`, `lineLength`, `encouragement`, `hintSpeed`, `exampleStyle` and up to 3 interests. `sproutPromptAddition` renders a fenced `<LEARNER_STYLE>` block (at most 520 characters, style only: no scores, names or weak topics). It returns null unless `shouldInjectLearnerDna` allows it (never with a `cacheKey`, shared class content, privileged calls), so it cannot leak into shared caches. The For you screen already uses the voice for Sprout's reactions. Appending the block in the tutor path (`lib/ai/router.ts`, next to the DNA injection) is a one-line follow-up that was left out because that file is owned by the AI-gateway hardening work.

## Privacy

Opt-in, plain-language explanation on the map page, editable, switch off any time, one-click delete, deleted with the account, not visible to teachers, no AI call per event. The one AI call (a two-sentence summary) happens at most once a week per opted-in learner with at least 20 observations, is quota checked, claims its slot before calling, uses only habit facts, rejects labelling words, and falls back to a plain sentence.

## Does it help learning? How to measure

Do not use time on app or taps. Randomise opted-in learners (or sessions) between **control**: feed ranked by need only (personalisation weights set to neutral) and **treatment**: full Mirror ranking. Guardrail: both arms keep the need-first rule.

Primary metrics, per learner over 4 weeks:
1. **Mastery gain per hour of study** (change in BKT `pL` summed over topics, divided by active minutes).
2. **Delayed-review retention**: correct rate on reviews 7 to 14 days after first mastery (FSRS review logs).

Secondary: share of due reviews completed within 2 days, exam-topic mastery at exam date, goal completion, return rate on the day after a "done" ending. Watch for harm: complaints, "too hard" rate, reset/switch-off rate. Decide with a pre-registered minimum effect and a 95 percent interval; stop early if the treatment arm loses on retention.

## Not built yet

Per-device goal progress is not synced across devices. The tutor prompt hook is not wired (see above). Candidate reads are bounded but uncached; if feed requests get hot, cache the candidate pool per learner for a minute.
