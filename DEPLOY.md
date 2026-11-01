# Synapta — Production Deployment Guide

This document describes the steps required to deploy Synapta to **Vercel** and **Firebase**.

---

## 1. Firebase Configuration

### Deploy Firestore Security Rules and Indexes
Ensure you have the Firebase CLI installed (`npm i -g firebase-tools`) and authenticated (`firebase login`):

```bash
# Deploy strict Firestore security rules and composite indexes
firebase deploy --only firestore:rules,firestore:indexes --project synapta-learning
```

### Firebase Console Authentication Settings
In the [Firebase Console](https://console.firebase.google.com/project/synapta-learning/authentication/settings):
1. Navigate to **Authentication > Settings > Authorized domains**.
2. Add your production Vercel domain (e.g., `synapta-zeta.vercel.app` or custom domain).
3. Under **Sign-in method**, ensure **Google** and **Email/Password** are enabled.

---

## 2. Vercel Environment Variables

Set the following environment variables in your Vercel Project Settings (**Settings > Environment Variables**):

| Variable | Description | Example / Note |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API Key | `AIzaSy...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `synapta-learning.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID | `synapta-learning` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Cloud Storage Bucket | `synapta-learning.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID | `39168865444` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Web App ID | `1:39168865444:web:...` |
| `FIREBASE_ADMIN_PROJECT_ID` | Server Project ID (legacy `FIREBASE_PROJECT_ID` supported) | `synapta-learning` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service Account Email (legacy `FIREBASE_CLIENT_EMAIL` supported) | `firebase-adminsdk-...@synapta-learning.iam.gserviceaccount.com` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Private Key PEM (legacy `FIREBASE_PRIVATE_KEY` supported) | Replace `\n` with actual newlines |
| `GEMINI_API_KEY` | Google Gemini API Key | `AIzaSy...` |
| `GEMINI_MODEL` | Gemini Model ID | `gemini-3.1-flash-lite` |
| `ADMIN_EMAILS` | Comma-separated admin whitelist | `admin@synapta.app` |
| `STUDENT_TOKEN_LIMIT` | Monthly student token cap | `50000` |
| `TEACHER_TOKEN_LIMIT` | Monthly teacher token cap | `200000` |

---

## 3. Build & Production Verification

Run the verification suite locally before deploying:

```bash
npm run verify
```

This validates TypeScript compilation, ESLint, Vitest test suites, and CI array guards.

## 4. Live updates, gamification & community features

These features need the latest Firestore rules and indexes deployed:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

- **Rules**: clients may read `liveChannels/*` (counters only, no data) and their own
  `userSignals/{uid}` and `users/{uid}/notifications/*`. All writes stay server-only.
- **Indexes**: leagues (`leagueEntries`), feed (`posts`), challenges (`events`) and study sessions
  (`studySessions`). Index builds take a few minutes; until they finish those lists return an error.
- **Optional cron** for study-session reminders when nobody has the app open (reminders are also sent
  automatically whenever anyone views sessions). Add to `vercel.json`:

  ```json
  { "crons": [{ "path": "/api/jobs/session-reminders", "schedule": "*/5 * * * *" }] }
  ```

  Vercel sends `Authorization: Bearer $CRON_SECRET`; set `CRON_SECRET` in the project env.
- Weekly leagues settle lazily (the first time each learner earns XP in a new week), so no cron is needed.

- **Firestore TTL policies** (Console → Firestore → TTL): add a policy on field `purgeAt` for collections `rateLimits` and `quotaReservations` so rate-limit counters and finished reservations are cleaned up automatically. Nothing breaks without them (old documents are ignored); they just accumulate.

## 5. Social, messages, notebooks & push notifications

Redeploy indexes after pulling (`firebase deploy --only firestore:rules,firestore:indexes`). New
composite indexes: `posts` (Following and #hashtag feeds), `chats` (Messages inbox) and `notebooks`
(Study Hub notebook list).

- **Post photos** are stored in the default Firebase Storage bucket under `posts/{uid}/` by the server
  and served through the authenticated `/api/media/...` route. The bucket must exist
  (`FIREBASE_STORAGE_BUCKET` / `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`); no Storage rules changes are needed.
- **Web push** (optional): Firebase console → Project settings → Cloud Messaging → Web Push
  certificates → *Generate key pair*, then set `NEXT_PUBLIC_FIREBASE_VAPID_KEY` to the public key.
  Without it the "Push notifications" toggle in Settings stays hidden and in-app notifications still work.
- **Streak reminders** (optional cron, same `CRON_SECRET` bearer as above):

  ```json
  { "crons": [{ "path": "/api/jobs/streak-reminders", "schedule": "0 18 * * *" }] }
  ```
- **Audio lessons** now write the script first and voice each line on demand (cached after the first
  listen), so no extra setup is needed; a line that can't be voiced in time falls back to the device voice.

## 6. Checking the AI after a deploy

Sign in as an admin → **Admin → System → Run self-test**. It calls the tutor models, structured JSON
generation, the heavy build models, the free Edge voices and Gemini TTS, and shows which model
answered and how long it took. If a row fails, its message says why (missing/invalid
`GEMINI_API_KEY`, quota, or a voice provider being unreachable). Old model IDs left in
`GEMINI_MODEL_*` env vars are ignored automatically when Google has shut them down.

## 7. Deploying Firestore rules & indexes without a laptop

The **Deploy Firestore rules & indexes** GitHub Action runs the same `firebase deploy` from GitHub.

1. Add credentials once (GitHub → repo → Settings → Secrets and variables → Actions → New repository secret):
   `FIREBASE_ADMIN_CLIENT_EMAIL` and `FIREBASE_ADMIN_PRIVATE_KEY` with the same values as in Vercel
   (or `FIREBASE_SERVICE_ACCOUNT` containing a whole service-account JSON file).
2. GitHub → Actions → **Deploy Firestore rules & indexes** → **Run workflow**.

It also runs automatically whenever `firestore.rules` or `firestore.indexes.json` change on `main`.
If it fails with a permission error, give that service account the **Firebase Admin** role in
Google Cloud console → IAM.

## 8. Maker Studio

No extra setup is required: designs, versions and challenge scoring all run on Firestore and the
built-in simulators. Redeploy indexes after pulling (`designs` collection) — or run the
**Deploy Firestore rules & indexes** GitHub Action.

- **YouTube videos per step (optional):** create a free API key in Google Cloud console →
  APIs & Services → enable **YouTube Data API v3** → Credentials → Create API key (restrict it to
  that API). Set `YOUTUBE_API_KEY` in Vercel and redeploy. Without it, steps show a "Watch on
  YouTube" search link instead of embedded videos. Results are cached for 30 days to stay within the
  free quota (~100 searches/day).

## 9. Voices and AI models

- **Podcast / lesson voices** use two different hosts everywhere: Alex (female) and Sam (male) — free
  Edge neural voices first, then Gemini TTS (Kore / Puck), then the device's own voices (a female and a
  male voice, told apart by pitch when needed). If the free Edge service is blocked from your host it is
  skipped for 10 minutes after two failures so playback doesn't stall. Set `VOICE_ENGINE=gemini` to skip
  Edge entirely (default `auto`).
- Spoken lines are cached in Firestore (`ttsCache`) and shared: a podcast script is voiced once, however
  many learners play it. Playback is gapless (Web Audio) and every remaining line loads in the background.
- **Which model does what** is defined in `lib/ai/models.ts` (`TASK_GROUPS`): tutor, quizzes, flashcards,
  study guides, podcast scripts and research run on the fast model; class builds, simulations, Maker Studio
  designs, assignments and grading run on the strongest model. Admins can still pin any single task.

## 10. Security checklist (launch)

What the app enforces in code:

- **Database:** `firestore.rules` denies every browser write; the server writes through the admin SDK. A test (`lib/auth/firestore-rules-file.test.ts`) fails if a rule ever opens a client write. Deploy the rules after changing them (section 7).
- **Cross-site requests:** `proxy.ts` refuses API writes whose `Origin` is another site, and the session cookie is `httpOnly`, `secure` and `SameSite=Lax`. The API sends no CORS headers, so other sites cannot read it.
- **Rate limits:** every API write has a baseline limit per signed-in user (240/min) or per IP (60/min), and costly routes (AI, uploads, sign-in) add their own tighter, shared limits.
- **Body size:** API requests over 26 MB are refused before they are read.
- **Email verification:** email/password accounts get a confirmation email; posting, commenting, messaging and uploads wait until it is confirmed (a banner offers resend).
- **Admin:** every `/api/admin/*` route requires the `admin` role on the server; the `/admin` pages also need a session.
- **Secrets:** only the public Firebase web config uses `NEXT_PUBLIC_`; Gemini, Firebase admin and `CRON_SECRET` stay on the server. Scheduled jobs check `CRON_SECRET` in constant time and refuse everything when it is unset.
- **Errors and logs:** unexpected errors return a generic message with a request id; auth logs redact tokens; client error reports drop query strings and long tokens.
- **Uploads:** images and videos are checked by their bytes (not the claimed type) and size.
- **Headers:** CSP (incl. `frame-ancestors 'none'`, `object-src 'none'`), HSTS, `nosniff`, `X-Frame-Options: DENY`; no `X-Powered-By`, no browser source maps.
- **AI simulations** run in a sandboxed iframe without same-origin access.

What you set up once:

1. **Vercel:** set `CRON_SECRET` (a long random string) so the reminder jobs run.
2. **Firebase console → Authentication → Templates:** check the email-verification template's sender name and link domain.
3. **GitHub → Settings → Secrets → Actions:** add `ANTHROPIC_API_KEY` to turn on the Claude security review on every pull request (`.github/workflows/security-review.yml`); without it the check skips.
4. Run `npm audit` before each release. Remaining known items: `zod` 3 (mitigated by the body-size cap; upgrade to zod 4 after launch) and eslint tooling (development only).
