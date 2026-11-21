# Streaks and leaderboards

Two rules from the founder: **a streak counts learning, not logging in**, and **the weekly board ranks XP gained that week, never total XP**.

## 1. Streaks: learning points

A streak day counts only when the learner earns **30 learning points** that day. Rules live in `lib/streak/qualify.ts` (pure, tested in `qualify.test.ts`).

| Kind | Points per credited action | Daily cap for the kind | Recorded by |
| --- | --- | --- | --- |
| quiz answer | 3 | 30 | `applyEvidence` (non-diagnostic) |
| flashcard review | 2 | 20 | `applyEvidence` and `POST /api/flashcards/review` |
| written practice marked | 8 | 24 | `applyEvidence` (theory) |
| lab completed | 15 | 30 | `applyEvidence` (lab, correct) |
| past-question attempt | 4 per answered question (max 5 per paper) | 24 | `POST /api/papers/[id]` on first submission |
| lesson reading | 3 per reader signal | 24 | `POST /api/classes/[id]/read/signal` |
| peer explanation | 10 | 20 | `applyEvidence` (peer_explain, correct) |

- Caps mean one spammed action cannot qualify a day alone. Only quizzes (10 answers) or two labs can reach 30 on their own, and those are already rate-limited server-side (Decision 8).
- Reader progress signal: each accepted in-lesson event (page turn, term explored, interactive played, check passed, chapter completed) is one reader action. `recordLearning` only counts one every 15 seconds (`READER_MIN_GAP_MS`) and caps the kind at 24 points, so reading alone never qualifies a day (about 8 pages plus other work).
- **Never create, extend or heal a streak:** app open, `/api/device` presence pings, `/api/auth/bootstrap` sign-in, notifications, `/api/me/*` and `/api/streak` reads, learning telemetry (`/api/study/telemetry`), and plain XP awards (`trackProgress`). The old `touchUserStreak` is gone.
- The only writer of `streakDays`, `lastQualifiedDate` and `lastActiveDate` is `recordLearning` in `lib/streak/server.ts` (plus shop streak recovery, which moves both dates back one day). It runs in one Firestore transaction on `streakDays/{uid}_{YYYY-MM-DD}` (`counts`, `points`, `qualified`, `lastReaderAt`) and the user doc. Day ids are UTC, as before.
- Freezes work as before (`nextStreak`): a missed day is covered by a freeze, a freeze is earned every 7 days, max 3.
- Reads are pure: `viewStreak(userDoc, today)`.

### Migration (safe, no backfill)

- New field `users.lastQualifiedDate`. `lastActiveDate` is now written together with it (it means "last qualified day") so older readers (shop recovery, pet, admin) keep working.
- Existing streaks keep `streakDays`. When `lastQualifiedDate` is missing, `lastActiveDate` is used as the last extension date (`streakAnchorDate`), exactly as before. A learner who only logged in today under the old rule keeps that one day as a grace; from their next qualified day only qualified days extend the streak.
- Calendar (`/api/streak`): days before `QUALIFY_RULE_START` (`2026-11-22` in `lib/streak/qualify.ts`, set it to the deploy date) still use old activity data; later days show only qualified days.
- New sign-ups start at `streakDays: 0` (they used to get 1 for opening the app).
- Admin "last active" columns that read `lastActiveDate` now mean last qualified day; device `lastSeen` is the presence signal.

### UI

- Dashboard: streak strip under the header (`components/game/streak-progress.tsx`): "Today's streak: 14/30 points. Answer 6 more quiz questions, or mix ... to keep your streak."
- Streak page: same progress card and an explanation. `GET /api/me/game` returns `streakToday`, `GET /api/streak` returns `progress`.

### Reminders (`/api/jobs/streak-reminders`)

Candidates are learners whose streak was extended yesterday (`lastActiveDate == yesterday`, streak of 2+, reminders not turned off) and whose points in `streakDays/{uid}_{today}` are below 30. The copy states points earned and what keeps the streak, and mentions a held freeze. `lib/streak/reminder.ts` is tested.

## 2. Weekly leaderboard: XP gained

- **Week** = Monday 00:00 to Sunday 23:59:59 **Africa/Lagos (WAT, UTC+1, no DST)**. `weekIdFor(date)` in `lib/game/leagues.ts` (re-exported by `lib/weekly/week.ts`), ids like `2026-W42`. Boundary: Sunday 23:00 UTC starts the next week. Tests in `lib/game/game.test.ts` and `lib/weekly/week.test.ts`.
- **Where XP is recorded:** `trackProgress` (`lib/game/progress.ts`) is the single place every XP award passes through. It increments `users.xp`, then `addWeeklyXp` increments `weeklyBoards/{weekId}/entries/{uid}` (`xp`, `updatedAt`) and the league entry. The weekly write is a separate atomic increment after the XP transaction, not in the same transaction (best effort; a failure loses at most one increment from the weekly board, never from total XP).
- **Ranking:** by that delta only: +200 (100 to 300) beats +1 (500 to 501). Tie-break: the learner who reached the XP earlier (`updatedAt` of the last increment), then uid. `rankEntries` in `lib/weekly/week.ts`.
- **This week** tab (`GET /api/leaderboard/weekly`): top 50, the viewer's own rank, XP needed to pass the next person, last week's top 3. **All time** tab is total XP, labelled separately. Rank counting for viewers outside the top list uses a composite index (`weeklyBoards/*/entries` on `xp`, `updatedAt`, added to `firestore.indexes.json`; deploy it with `firebase deploy --only firestore:indexes`). Without it ties are ranked after the viewer.
- **Hall of fame:** `finalizeWeek(weekId)` (`lib/weekly/server.ts`) writes `weeklyWinners/{weekId}`: top 10 with `uid`, `displayName`, `username`, `photoURL`, `xp` and `rank`. It refuses a week that is not over, is idempotent (existing record returned, `create()` guards races), and only the call that creates the record notifies the top 3. It runs lazily when the board or the past-winners list is read, and from the cron below. `GET /api/leaderboard/winners` and the "Past winners" tab show the last 12 weeks.
- **Privacy:** only learners with `settings.showOnLeaderboard !== false` are ranked or saved to the hall of fame. At read time anyone who has since opted out shows as "Hidden learner". Opted-out viewers still see themselves on the live board.
- **Leagues** (`leagueEntries`, `leagueCohorts`): unchanged behaviour. A league entry's `xp` is already that week's XP gained, so promotion (top 7 up, bottom 5 down in cohorts of 15 or more) is by weekly gain, and the cohort now uses the same WAT week. Ties in a league list are ordered by who reached the XP first, but promotion rank counts only people strictly above, so tied learners share a rank.

### Cron to add in Coolify

Scheduled task, weekly, **Monday 00:05 Africa/Lagos = Sunday 23:05 UTC**: cron expression `5 23 * * 0` (UTC)

```
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/jobs/weekly-finalize
```

`GET`, idempotent. It finalises last week and back-fills up to 3 earlier missed weeks. The existing `/api/jobs/streak-reminders` cron stays (for example 18:00 UTC).

## 3. XP anti-cheat audit (Decision 8)

Server-capped: evidence XP (flashcards 30 per day per topic and 5 full-XP cards, written practice 5 per day per topic, labs 1 per 10 minutes per topic, mastery bonus once per topic), reading (60 XP per day), daily quiz and quests (once per day), focus rooms (daily block limit), ask-accepted (once per reply), session join (once per session), Maker Studio steps (first completion only), shout-outs (12 per hour, per-pair limits).

**Not capped, or only weakly capped (worth fixing):**
- `POST /api/worlds/[worldId]/progress`: up to 60 XP per call from client-reported results, with no per-day cap.
- Referrals (`/api/referrals`): +250 XP to both sides per claim, no cap on how many referrals; it writes `users.xp` directly, so it does not appear on the weekly board but does inflate all-time XP.
- Shout-outs: +5 XP to the receiver; two cooperating accounts can trade them within the per-pair limits.
- Quiz answers are credited per answer for streak points; a wrong answer still counts as a credited answer (it is effort), capped at 30 points a day.
