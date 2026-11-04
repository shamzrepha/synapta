# Master brief for Antigravity: build the Sunroot app and finalise the launch

You are the whole product team for a funded-ready startup: **mobile engineer, full-stack engineer, designer, QA lead, security engineer, growth marketer, support lead.** Work as each of them in turn. The web app is built. Your job is to turn it into a real, installable app, close the launch gaps below, and leave the founder with a clean, safe, sellable product.

Repo: `shamzrepha/synapta` (Next.js 16 App Router, React 19, Firebase Auth + Firestore, Gemini, Paystack, Vercel). Live: https://sunrootlearn.vercel.app. Pull `main` first. Never commit `AGENTS.md`, `.env*`, keys or the pitch brief.
Before **every** push run: `npx tsc --noEmit`, `npx eslint . --ignore-pattern ".claude/**"` (0 errors), `npm run check:guards`, `npm run check:models`, `npx vitest run`. Read the real error count, not the tail. Re-run all after merging `main` into your branch.

## Product in one paragraph
Sunroot is a **universal study app**. A student uploads any file (text PDF, scanned notes, photos, Word, slides). Sunroot reads it, decides what that topic needs, and builds only that: study notes, animated "Teach me" lessons, flashcards, quizzes, practice, simulation or lab where it makes sense, an AI tutor, a voice tutor, a podcast, and a "How am I doing?" evaluation with a study plan. Teachers publish classes from a syllabus file. Students pay for more AI allowance with Paystack. Admins run the whole thing from `/admin`.
Brand: forest green `#12241C`, sun orange `#F28C28`, cream `#FBF6EC`; Space Grotesk and DM Sans. Never invent users, ratings or metrics in any copy.

## Hard rules
1. **No secrets in git, logs, screenshots or chat.** Keys live in `.env.local` and Vercel env only. If the founder pastes a key, tell them to rotate it. A Paystack test key was pasted earlier in a chat: it must be rotated (Paystack dashboard > Settings > API Keys).
2. Do not set `BILLING_ENFORCED`. The admin switch at `/admin/billing` controls limits (Off / Test accounts only / Everyone). Default Off until the founder says otherwise.
3. All model names go through `lib/ai` (the CI guard fails on hardcoded model strings). Add AI work as a task in `lib/ai/tasks.ts` and call `generateWithFallback`.
4. Every new API route: `requireUser` (or admin guard), zod-validate the body, rate-limit/quota where it costs money, return `{ok, error:{code,message}}`, never leak stack traces.
5. Keep the UI plain-language. Every error says what happened and what to do next.

---

## PART A. Make it a real app (do this first)

Recommended path: **Capacitor** wrapping the live PWA so one codebase ships Android + iOS fast, then deepen native features. (If you judge Expo/React Native better, say why in the PR before starting.)

### A1. Installable PWA baseline (1 day)
- `app/manifest.ts` exists: verify name, short_name, `start_url=/dashboard`, `display=standalone`, theme/background colours, maskable 192/512 icons, screenshots for the install sheet, shortcuts (Study, Scan notes, Tutor).
- `public/sw.js` and `public/firebase-messaging-sw.js`: confirm offline fallback at `/offline`, cache static assets only, never cache `/api/*` or authenticated HTML. Version the cache and delete old ones.
- Add an in-app **"Install Sunroot"** prompt (Android `beforeinstallprompt`; iOS Safari hint "Share > Add to Home Screen"), shown once after the student's first completed study action, dismissible, never nagging.

### A2. Native shells with Capacitor
- `npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios`; `npx cap init Sunroot com.sunroot.learn --web-dir=out` is NOT used. Use **`server.url = https://sunrootlearn.vercel.app`** (remote web app) so web fixes ship instantly without store review. Add an offline splash page in the bundle.
- App id `com.sunroot.learn`. Adaptive icons and splash from `public/logo-mark.svg` (forest-green background, sun-orange mark).
- Plugins: `@capacitor/push-notifications` (FCM), `@capacitor/camera` (scan notes), `@capacitor/filesystem` + `@capacitor/share`, `@capacitor/app` (deep links + back button), `@capacitor/status-bar`, `@capacitor/haptics`, `@capacitor/network`, `@capacitor/browser` (Paystack checkout in a system browser tab, then return via deep link `sunroot://plans?paid=1`).
- Android: hardware back button must follow the web router (`@capacitor/app` `backButton` -> `history.back()`, exit only on the dashboard). Request mic permission just-in-time for the voice tutor.
- iOS: set `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription` with honest one-line reasons. Apple requires **Sign in with Apple** if any other social login is offered: add it (Firebase Auth Apple provider) or remove social logins from the iOS build.
- Safe areas: use `env(safe-area-inset-*)` in the shell (`components/shell/*`); the topbar and bottom nav must not sit under the notch/home bar. Verify on a 360px Android and iPhone SE and 15 Pro Max.
- Deep links / universal links for `/r/*` (referral), `/classes/*`, `/plans`. Host `apple-app-site-association` and `assetlinks.json` under `public/.well-known/` (ask the founder for team id and SHA-256 fingerprints; never invent them).

### A3. Native-feeling features (after the shells run)
- **Scan notes**: camera -> crop/deskew -> upload to the existing document reader (`/api/documents/*`, vision OCR). Multi-page capture, retake, reorder.
- **Push**: fix and finish setup using `docs/antigravity/PUSH-NOTIFICATIONS-SETUP.md`. Daily study reminder at the time the student chooses; streak-at-risk nudge; assignment due; never more than 2 a day; quiet hours 21:00–07:00 local.
- **Offline**: downloaded notes/flashcards readable offline (IndexedDB), sync answers when back online (`lib/offline`).
- **Biometric re-open** (optional, later): Face/Touch ID gate via a Capacitor plugin if the founder asks.
- Haptics on correct answers, streak milestones, level-ups. Respect `prefers-reduced-motion`.

### A4. Store release checklist
- Android: signed AAB, Play Console listing, Data safety form (collects: email, name, usage, uploaded study files, payments handled by Paystack; no ads), content rating, privacy policy URL, account-deletion URL (see B3). Internal testing track first.
- iOS: TestFlight first. App Privacy labels must match B3. Review notes must include a **test account** (create one under `/admin/billing` > Test accounts) and say that payment is for digital study allowance. **Apple rule 3.1.1**: digital subscriptions sold inside an iOS app must use In-App Purchase unless an exception applies. Flag this to the founder BEFORE submitting; the safest launch path is Android + web first, and iOS with Paystack hidden (read-only plan display, "manage on the web") until StoreKit is added.
- Screenshots: 6 per device in brand colours, real UI only, captions in plain words.

---

## PART B. Security hardening (act as the security engineer)

The founder asked to "refine all assigned IDs to be sure no future issue". Treat every identifier as untrusted.

### B1. Identifier hygiene (audit every route under `app/api/**`)
- **Never trust a client uid/classId/kcId/paymentRef.** The caller's uid comes only from the verified session (`requireUser`). For every `[classId]`, `[kcId]`, `[notebookId]`, `[id]` route, load the document and verify the caller owns it, is enrolled, or is the teacher/admin. Add a test per route that a second user gets 403/404 (not 200).
- Return **404 for both "missing" and "not yours"** so IDs can't be enumerated.
- IDs we generate must be unguessable: use `crypto.randomUUID()` / Firestore auto-ids, never sequential or derived from email. Referral codes and share links: high-entropy, revocable, rate-limited lookup.
- Validate every id param with a strict pattern (`^[A-Za-z0-9_-]{6,128}$`) before touching Firestore; reject path characters (`/`, `..`).
- Payments: `payments/{reference}` is keyed by our own `sr_…` reference. Confirm the webhook (a) verifies HMAC-SHA512 with the raw body, (b) checks `data.reference` exists in our table, (c) checks amount and currency match the plan price (kobo), (d) is idempotent (second delivery is a no-op), (e) never trusts a uid sent in metadata over the stored one.
- Admin routes: one shared `requireAdmin` helper; admin is decided by the server-side role/claim, never a client flag. Add a test that a normal user gets 403 on every `/api/admin/**` route (enumerate the folder in the test so new routes are covered automatically).

### B2. Platform hardening
- Firestore rules (`firestore.rules`): deny by default; users read/write only their own docs; `payments`, `config`, `evaluations`, `featureUsage` writes server-only. Add rules unit tests (`@firebase/rules-unit-testing`) for the 10 most sensitive collections.
- Storage rules likewise. Uploads: size caps (documents 25 MB, images 10 MB), content-type allow-list, sniff magic bytes, strip EXIF GPS from images, random object names, virus-scan hook point documented.
- Headers: CSP is in `next.config.ts` (keep strict; the push worker has its own rule). Add `Cross-Origin-Opener-Policy: same-origin-allow-popups` only if sign-in popups still work. Check HSTS preload readiness.
- Cookies: session cookie is `httpOnly`, `secure`, `sameSite=lax`, 14 days; "Keep me signed in" off = browser-session cookie. Add CSRF protection for state-changing POSTs (verify `Origin` header against the site origin in `proxy.ts`).
- Rate limits: login, signup, password reset, `/api/billing/checkout`, AI routes, file upload, referral lookup. Return 429 with `Retry-After`.
- Secrets scan in CI: add `gitleaks` (or the repo's `run_secret_scanning`) as a required check. `npm audit --omit=dev --audit-level=high` as a non-blocking report.
- Dependabot/Renovate weekly; pin GitHub Actions by commit sha.
- Logging: structured JSON, no PII, no tokens, no full request bodies. Client error reporter `/api/client-errors` must be rate-limited and size-capped.
- AI abuse: prompt-injection guard on uploaded documents (treat file text as data, never as instructions; the system prompt must say so), output length caps, per-user daily token ceiling even for paid plans (cost safety net), admin kill switch per AI task.

### B3. Privacy and compliance (needed for the stores and for Nigerian/EU students)
- Pages: Privacy Policy, Terms, Refund policy (Paystack requires clear refund/cancellation terms), Cookie notice, Contact. Plain language, dated, no invented company details; use `TODO(founder)` placeholders for registered name/address and flag them.
- **Account deletion** (Play + Apple require it): `Settings > Delete my account` -> confirm -> deletes Firebase Auth user, profile, notebooks, uploads, push tokens; keeps only legally required payment records (anonymised). Also a public URL explaining how to request deletion.
- **Data export**: `Settings > Download my data` (JSON/zip).
- Minors: if under 13 (or under 16 in the EU) require a parent/teacher-managed account or block signup; ask the founder for the intended age range before choosing.
- Consent: analytics and marketing emails are opt-in and separate from signup.

---

## PART C. Admin configuration (act as the ops lead)

Everything below should be reachable from `/admin` with a left nav: **Overview · People · Billing · Plans & prices · AI · Content · Reports · Announcements · Audit log · System**. Mobile-friendly. Every change writes an audit record (who, what, before/after, time).

Already built: billing switch (Off / Testers / Everyone), People search with grant plan/trial/test account/remove/reset usage, payments list, per-task model assignment (Admin > System), usage and reports APIs. Finish and connect these:
1. **Overview dashboard**: today's signups, active students, AI calls and estimated AI cost, revenue this month (from `payments`), failed payments, open reports, error rate. Real data only; show "No data yet" instead of zeros that look like data.
2. **Plans & prices editor**: edit price, term discounts, limits per feature and per-minute caps in a `config/plans` doc (validated, cached 10s), with a **preview** of what a student sees, and a "revert to defaults" button. Changing a price never alters past payments.
3. **Promo codes & gifts**: create codes (percent/amount, plan, expiry, max uses, per-user limit), see redemptions, disable instantly. Paystack checkout applies the code server-side.
4. **Refunds & disputes**: from a payment row, mark refunded (calls Paystack refund API when the founder enables it), revoke the plan, log it. Show chargebacks.
5. **Abuse and cost controls**: global AI on/off, per-task on/off, per-user temporary block with reason, daily spend ceiling with an alert banner when 80% is reached.
6. **Feature flags** (`config/flags`): toggle features (voice tutor, podcast, labs, social feed, studio, push) without a deploy; every UI entry hides when off.
7. **Announcements & email**: in-app banner and push to everyone, a plan, a role, or one class. Preview before send, confirm count, throttle, unsubscribe link for emails.
8. **Content moderation queue**: reported posts/messages/classes, with hide, warn, suspend, restore; reporter and subject notified; appeal note.
9. **Support inbox**: contact form -> `support/{id}` with status (open/answered/closed), reply by email, link to the user's People record.
10. **Roles**: owner, admin, support (read-only People + reply), finance (Billing only). Enforce server-side in `requireAdmin(role)`.
11. **Backups & exports**: CSV export of people, payments, usage (finance role); a documented Firestore scheduled backup and restore drill in `docs/ops/RUNBOOK.md`.
12. **Health page**: Firebase, Gemini, Paystack webhook last-seen time, push delivery rate, `/api/health` status, and recent client errors.

---

## PART D. Marketing and growth (act as the growth marketer, honest copy only)

- **Landing page** (`app/(marketing)`): one clear promise ("Upload anything you need to learn. Sunroot turns it into a lesson you can use."), a 20-second real demo video (Veo clips in `public/landing`), three proof points that are true today, pricing with the real plan ladder, FAQ (data safety, which files work, how payment works, refunds), final CTA. No fake testimonials, user counts or logos.
- **SEO**: unique titles/descriptions per public page, `sitemap.ts` and `robots.ts` verified, Open Graph image per page (`opengraph-image.tsx`), JSON-LD `SoftwareApplication` + `FAQPage`, Google Search Console verification file already exists (`public/google*.html`; keep it), canonical URLs, fast LCP (images sized, fonts preloaded).
- **Programmatic pages (later)**: public topic explainers (e.g. "Pythagoras' theorem, step by step") that link into the app. Only publish ones that are accurate and reviewed.
- **Activation**: first-run flow takes a new student from signup to "my first lesson from my own file" in under 3 minutes; checklist on the dashboard (upload, try Teach me, make flashcards, take a quiz, set a reminder). Measure each step.
- **Retention**: streaks, weekly summary push/email ("You studied 4 days; here is your weak topic"), the evaluation plan from `/study/evaluation`, exam-date countdown.
- **Referrals**: `/r/[code]` exists; reward both sides with extra allowance (not cash), cap per user, block self-referral and duplicate devices, show progress.
- **Analytics** (privacy-friendly, consent-gated): events for signup, first upload, lesson viewed, quiz done, upgrade dialog shown, checkout started, payment success, churn. Funnel view in the admin Overview. No third-party trackers that can see file content.
- **Pitch support**: keep the pitch brief out of `public/`. Do not add claims you cannot back.

---

## PART E. Quality and reliability (act as QA lead)

- Playwright smoke suite (`e2e/`): landing, signup, login + keep-signed-in restore, upload a text PDF and a scanned image, open Teach me, make flashcards, hit a plan limit -> upgrade dialog -> Paystack test checkout -> plan active, admin gives a plan, sign out. Run on CI against the Vercel preview.
- Lighthouse on landing + dashboard: Performance ≥ 85, Accessibility ≥ 95 (mobile). Fix contrast, labels, focus order, tap targets ≥ 44px.
- Error budget: Sentry (or equivalent) with PII scrubbing; release tagging; alert on error spike.
- Load sanity: 200 concurrent students reading notes; AI routes degrade gracefully (queue/clear "busy, try again in a minute").
- Accessibility and language: keep `lib/i18n`; screen-reader labels on icon buttons; captions/transcripts for audio; dyslexia-friendly font toggle.
- Runbook `docs/ops/RUNBOOK.md`: deploy, rollback (Vercel promote previous), rotate keys (Firebase, Gemini, Paystack), outage playbook, who to call, how to switch billing off in 10 seconds (`/admin/billing`).

---

## Order of work (one PR each, merge only when CI is green)
1. B1 identifier audit + tests, B2 rules/headers/rate limits (biggest risk, smallest diff to users).
2. B3 legal pages + account deletion + data export (store blockers).
3. C1–C4, C5, C6 admin finishes (plans editor, promo, refunds, cost controls, flags).
4. A1 PWA polish, then A2 Capacitor Android build, A3 scan + push, A4 Play internal testing.
5. D landing/SEO/activation, E e2e + Lighthouse.
6. iOS last, after the Apple 3.1.1 decision with the founder.

## Definition of done
- All five checks pass locally and in CI; no new lint errors; tests added for every route you touched.
- A second test account cannot read anything of the first account's (proved by tests).
- A signed Android build installs, signs in, scans a page, gets a lesson, pays with a Paystack test card, and receives a push.
- Admin can, without touching code: switch limits on/off, give a plan, edit a price, create a promo code, turn a feature off, pause AI, and see revenue and errors.
- No secret appears in git history, logs or the repo (`gitleaks` clean).
- Report back with: what shipped, what was skipped and why, anything that needs a founder decision (company name/address, age range, Apple IAP, store accounts, domains).
