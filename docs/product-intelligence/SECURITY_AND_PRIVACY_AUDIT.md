# Security and Privacy Audit (read-only)

Repo: shamzrepha/synapta (SunRootLearn). Audited 2026-11-19 from a worktree checkout, by static reading only. No code run, no production calls, no exploit attempts. Evidence labels: Verified (read in code), Partially verified, Assumption, Unknown. Confidence: HIGH / MEDIUM / LOW / UNKNOWN. This is not legal advice; legal review is flagged where needed.

## 0. Direct answers

| Question | Answer |
|---|---|
| Can a student read another student's records? | Not through the client SDK: `firestore.rules` scopes mastery, evidence, misconceptions, learnerProfiles, usage, userSignals to `uid == request.auth.uid` or admin. API routes sampled (papers, snap, notebooks, studio paths, worlds) scope by caller uid or `assertClassAccess`. No cross-student read found. By design exceptions: any signed-in user can search all users by name/username (`app/api/users/search`), and school managers see per-student telemetry. (Verified for sampled routes, HIGH; 338 routes, not all read.) |
| Can a lecturer read another lecturer's private materials? | No path found. Rules expose `classes/*/materials` only to `teacherId`, `coTeacherIds`, admin; API uses `assertClassAccess(..., "mutate")`. Co-teachers and any admin see everything. `/api/media/*` is the weak spot: any signed-in user holding a path can fetch any stored image/video (S-07). (Verified, MEDIUM) |
| Are school tenants isolated? | At the API level yes, by `users.schoolId` plus `canManageSchool` (`lib/schools/policy.ts`, `app/api/schools/route.ts`). There is no Firestore-level tenant boundary (`schools` has no rule, so clients cannot read it at all); isolation depends on every route doing the check. Any signed-in user can create a school (`create_school`), become its principal, and see the roster of anyone who joins by code. (Verified, MEDIUM) |
| Can AI-generated HTML execute dangerous code? | It runs arbitrary JS, but inside `<iframe sandbox="allow-scripts allow-pointer-lock">` (no `allow-same-origin`, no popups, no top navigation) plus an injected meta CSP (`default-src 'none'; connect-src 'none'`). Cookies, storage, parent DOM and app data are unreachable. Residual: frame can self-navigate, spoof bridge messages, phish inside the frame, burn CPU. (Verified, HIGH) |
| Are uploads processed safely? | Mostly. Images checked by magic bytes (`uploads/image`, avatar JPEG), videos sniffed, sizes capped, nothing executed server-side. Gaps: `documents/read` and `snap` trust the declared MIME of the data URL and forward bytes to Gemini; PDFs are parsed in the browser, not on the server; no malware scan; body-size guard trusts `Content-Length`. (Verified, MEDIUM) |
| Can a malicious user cause uncontrolled AI spend? | Bounded for students, not fully for teachers or for many accounts. `generateWithFallback` reserves tokens transactionally when `userId` is passed, so student monthly caps hold. Teachers are uncapped until billing is enforced (`budgetOf`: `uncapped` when `role==="teacher" && !enforced`); teacher role is admin-approved. Several AI routes use only the per-instance in-memory limiter. Free sign-ups multiply quota. No global daily spend ceiling found in the repo beyond provider limits. (Verified, MEDIUM) |
| Which student info goes to external providers? | Document text, homework photos, student notes, chat text, audio, plus a per-learner "Learner DNA" block (mastery %, weak topics, misconceptions, mistake topics, pace) on personalised calls. Name and email are not in the DNA block. See 5.2. |
| Which privacy protections are missing? | No privacy policy or terms page, no consent screen, no age gate, no account deletion, no data export, almost no retention policy, no recorded provider DPAs, no breach-notification process. (Verified: grep of `app/`, `components/`, `lib/` found none.) |

## 1. Severity-ranked findings

| ID | Sev | Finding |
|---|---|---|
| P-01 | Critical (legal) | No account deletion, no data export, no privacy notice, no consent for processing (possibly minors') learning data. NDPA exposure; legal review needed. |
| P-02 | High (legal) | Student learning profile, documents, photos and audio go to Google, Groq, OpenRouter, Microsoft (Edge TTS), ElevenLabs with no disclosure, DPA record or cross-border basis in the repo. |
| S-01 | High | Admin-set provider API keys are stored as plaintext in Firestore `secrets/*` (`lib/ai/api-key.ts`). An admin-account compromise, a route bug through the single all-powerful service account, or a Firestore export exposes them. |
| S-02 | High | Rate-limit bypass in `proxy.ts`: the signed-in bucket key is the last 24 chars of an unverified cookie/Bearer value, so sending a different junk token each request gives a fresh 240/min bucket; the limiter is also per instance (`lib/security/api-guard.ts`). |
| S-03 | High | AI cost: teachers uncapped while billing is not enforced; AI routes `plans/generate`, `plans/[id]/regenerate`, `goals`, `grading/[id]/submit`, `studio/designs`, `studio/debug`, `classes/[id]/kcs/[kcId]/simulation`, `ai/quiz`, `study/daily` use only in-memory `checkRateLimit` (not `shared: true`), so serverless scale-out multiplies the limit. The token reservation inside `generateWithFallback` still applies if the call passes `userId` (Partially verified per route). |
| S-04 | Medium | CSP allows `script-src 'unsafe-inline' 'unsafe-eval'` and `img-src https:`; any future XSS is fully exploitable and images leak user IPs to third parties. |
| S-05 | Medium | School principals/teachers see per-student email, weak topics, readiness, study minutes (`schools` GET roster); students join by code with no consent step. Free self-registered school pilots (200 seats, `public_register_school`) hand out `plan: "school"` to members: abuse vector. |
| S-06 | Medium | `public/sunroot-3.2.apk` and `public/sunroot-3.3.apk` (8.9 MB each) are committed, against CLAUDE.md. Repo bloat; signing and provenance unknown. |
| S-07 | Medium | `/api/media/[...path]` serves any stored image/video to any signed-in user; the path is the only secret. |
| S-08 | Medium | `route-guards.test.ts` is a regex "file mentions a guard word" check; it does not prove the guard runs before data access. `lib/auth/rules.test.ts` tests a re-implemented allowlist, not `firestore.rules`. |
| S-09 | Medium | Prompt-injection defence is uneven: `sanitizeUntrustedPromptText` used in ~14 files, `<USER_INPUT>` wrapper in 6, of 38 files calling `generateWithFallback`. Teacher text and uploaded material feed AI that writes executable simulation HTML. |
| S-10 | Medium | `errorLogs.expireAt` (14-day retention) is written, but `DEPLOY.md` documents TTL only for `rateLimits` and `quotaReservations` on `purgeAt`. Client error logs hold IP and user agent. |
| S-11 | Low | Sim sanitizer is regex-based; CSP meta is injected after the first `/<head[^>]*>/` match, which also matches `<header>`. Depth only; the sandbox is the real control. |
| S-12 | Low | Logout (`DELETE /api/auth/session`) clears the cookie but does not call `revokeRefreshTokens`; a stolen cookie works up to 14 days (admin revoke does work, `checkRevoked=true`). |
| S-13 | Low | Checkout `callback_url` uses `req.nextUrl.origin` (host-derived). |
| S-14 | Low | No refund/chargeback handling: only `charge.success` is processed; plans are never revoked. |
| S-15 | Low | `x-forwarded-for` first hop trusted for rate keys and stored in errorLogs; spoofable outside Vercel (Docker self-host path). |
| S-16 | Low | Third-party image URLs (Wikimedia, Openverse) load directly in browsers. |
| S-17 | Low | `security-review.yml` uses `anthropics/claude-code-security-review@main` (mutable ref) with write permission on PRs. Pin to a SHA. |

## 2. Authentication and authorization

### 2.1 Firebase Auth, claims, session cookie
- `app/api/auth/session` POST: zod-validated `idToken`, `verifyIdToken`, `createSessionCookie` (14 days); cookie `__session` is `httpOnly`, `secure` in production, `sameSite: lax`; unticked "remember me" gives a browser-session cookie (`lib/auth/session-cookie.ts`). Rate limit 20/min via the in-memory limiter. Verified, HIGH.
- `lib/auth/requireUser.ts`: Bearer or cookie, both verified with `checkRevoked=true`. The role is re-read from `users/{uid}` on every call (Firestore wins over the token claim); disabled accounts are refused; privileged calls fail closed (503) if Firestore is down. Verified, HIGH.
- Custom claims: `role` set in `auth/bootstrap`, `me/request-teacher`, `admin/users/[uid]`; claims feed only `firestore.rules` `isAdmin()`. Admin auto-grant needs `ADMIN_EMAILS` match and `email_verified`. Admin role change revokes refresh tokens. Verified.
- `request-teacher` auto-approves only allow-listed admin emails; others become `pending` for admin approval. Verified.
- `proxy.ts` page protection checks only cookie presence (UI gate); real auth is in each API route. Acceptable because data flows through the API.
- `safeRedirect` blocks `//`, `/\`, control chars and encoded slashes. Verified.

### 2.2 firestore.rules (every rule)
Header: `allow read, write: if false` on `/{document=**}`. Note: Firestore rule matches are OR-ed, so this catch-all does not override other matches; safety comes from the explicit rules, which `firestore-rules-file.test.ts` partly checks (no client write allowed, no `if true`).
All client `write` rules are `false`: the browser can never write. Client reads:
- `users/{id}`: owner/admin. `users/{id}/notifications/*`: owner.
- `classes/{id}`: public and published, or teacher/co-teacher/admin, or active enrollee. `kcs`, `assignments`: teachers, or published and enrolled. `materials` (+`chunks`), `mapProposals`, `buildJobs`: teachers only.
- `enrollments`, `mastery`, `evidence`, `usage`, `misconceptions`: `uid == auth.uid` or admin.
- `sources` (+`chunks`): `ownerId`. `artifacts`: `ownerId`. `bugReports`: `reporterUid`. `jobs`, `sourceDocs`: `ownerUid`. `worlds`: owner, enrolled class member, admin.
- `rooms` (+`messages`, `presence`): `memberIds` contains uid.
- `learnerProfiles/{uid}`, `userSignals/{uid}`: owner/admin. `classSignals/{classId}`: enrolled or teacher.
- `kcMisconceptionCatalog/*/items`, `liveChannels/*`: any signed-in user (counters/timestamps per the comment).
- `auditLogs`, `errorLogs`: admin. `diagnosticSessions`, `rateLimits`, `quotaReservations`: nobody.
- About 120 other collections used through the Admin SDK (`chats`, `secrets`, `media`, `payments`, `snapHistory`, `schools`, `avatars`, ...) have no rule, so clients are denied. Good posture.
Risks: `liveChannels` readable by every signed-in user (low); a public published class is readable whole, so any `joinCode` or teacher PII field on that doc would be exposed (Unknown: field content not checked).

### 2.3 firebase-admin
`lib/firebase/admin.ts` initialises from `FIREBASE_ADMIN_*` env vars, server only, throws in browser code. One service account with full rights serves every route, so any route-level bug equals full-database access. `serverExternalPackages: ["firebase-admin"]`. Verified.

### 2.4 API authorization
- `app/api/route-guards.test.ts`: 338 routes; open routes must be on a 7-entry public list; admin routes need an admin check per handler; payment routes cannot read uid from the body. Strength: catches forgotten guards. Weakness: regex over file text with about 11 accepted words (S-08).
- Teacher/student separation: `requireUser(req, ["teacher","admin"])` on teacher mutations; class resources through `assertClassAccess` (`lib/auth/classAccess.ts`: owner/admin/student/visitor). Of 168 dynamic-segment routes my grep flagged 38 without obvious ownership keywords; I read worlds (`canPlay`), notebooks (`loadNotebook`), class join requests (teacher/co-teacher/admin transaction check), studio paths (scoped under `users/{uid}`), studio designs (`loadDesign`) and found checks. Not read, so Unknown: `feed/[postId]/*`, `events/[eventId]/*`, `communities/[id]/*`, `tutors/requests/[id]/*`, `polls`, `explainers/[id]/like`, `focus/rooms`.
- Join code compared with `===` and limited to 10/min per uid in memory. Low.
- Principals: `canManageSchool` = admin, principal, or a teacher the principal added; `canAssignTeachers` = principal/admin only. Sound. See S-05 for self-service school creation.

## 3. Input handling, rendering and web attacks

### 3.1 AI-generated HTML (`lib/sim/build.ts`, `lib/sim/inject.ts`, `components/labs/*`)
- Render: `ai-simulation.tsx` and `pieces-lab.tsx` use `srcDoc` with `sandbox="allow-scripts allow-pointer-lock"` and `referrerPolicy="no-referrer"`. No `allow-same-origin`, `allow-popups`, `allow-top-navigation` or `allow-forms`: opaque origin, so no cookies, storage, parent DOM or same-origin fetch. Verified, HIGH.
- `sanitizeSimulationHtml` strips `<script src>`, `<link>`, iframes/objects/embeds, `<base>`, meta refresh, CSS `@import`; injects `SIM_CSP` (`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'`). 400 KB cap.
- Host bridge (`SIM_BRIDGE_SCRIPT`): the frame posts `{source:"sunroot-sim"|"synapta-sim"}` to `parent` with target `"*"` (payload is non-secret). Both parent listeners require `e.source === frameRef.current.contentWindow` and the source tag, and only drive tutor text, confetti and stars. Mastery credit never trusts the frame: the check-question answer is stripped from the HTML (`extractSimMeta`) and graded on the server. Verified.
- Residual risks: (a) the frame can navigate itself to an external URL (meta CSP has no `navigate-to`), and the same `contentWindow` can keep posting spoofed messages; (b) in-frame phishing UI looks like app content; (c) CPU burn / hung tab; (d) the realistic attacker path is prompt injection through teacher text or uploaded material (S-09). `TEACHER_REQUEST` and `MATERIAL` are tagged but the model is told to follow the teacher request. Recommendation: add the iframe `csp` attribute where supported, strip `location`/`top` navigation heuristically as depth only, and never let labs render a login-like prompt (policy line in the guide).
- Three.js/SimKit runtime is fetched from first-party URLs (`lib/sim/runtime3d.ts`). Verified.

### 3.2 XSS
- `react-markdown` with `remark-gfm`, `remark-math`, `rehype-katex`; no `rehype-raw`/`allowDangerousHtml` anywhere (grep). KaTeX used without `trust`.
- `dangerouslySetInnerHTML` uses: JSON-LD (with `<` escaped), a constant theme script, constant print CSS, and `interactive-note.tsx` `formulaHtml` from `katex.renderToString` (safe with trust off). Verified, HIGH.
- External links from research results (`components/studio/*`) come through `lib/research/provider.ts`, which limits protocol to http/https.
- With `unsafe-inline`/`unsafe-eval` in the CSP, the CSP would not contain a future XSS (S-04).

### 3.3 CSRF
`proxy.ts` + `lib/security/api-guard.ts` refuse writes whose `Origin` host differs from `Host`; a missing Origin is allowed (curl, cron). The cookie is `SameSite=Lax`, which already blocks cross-site POSTs with cookies in browsers. GET routes with side effects: `billing/verify` activates a plan only for the caller's own paid reference. Verified, MEDIUM.

### 3.4 SSRF
Server fetches go to fixed hosts (Paystack, Groq, OpenRouter, ElevenLabs, Tavily, Brave, Wikimedia, Openverse, YouTube) with user input only in encoded query/path parts. The one dynamic base URL is the admin-configured provider `baseUrl` (`app/api/admin/worlds/ai/models/route.ts`, `lib/ai/structured/adapters.ts`): admin-only SSRF that also attaches the stored key. `SEARXNG_URL` is env-configured and referenced in `lib/images/find.ts` (Partially verified). No user-supplied URL is fetched. Verified, HIGH.

### 3.5 Uploads and PDFs
- `uploads/image`: verified email, 20/min, data-URL regex, 700 KB cap, magic bytes (JPEG/PNG/WebP/GIF), stored with detected type, served with `nosniff`. SVG excluded.
- Avatar (`profile/setup`): JPEG only with `looksLikeJpeg`, size cap, served as `image/jpeg`.
- Explainer video: verified email, 5 per 10 min, 25 MB, `sniffVideo`, fully buffered in memory.
- `documents/read` and `snap`: size caps (~4.2M chars) and `parseImageDataUrl` allow-list on the declared MIME, then bytes go to Gemini; images are not stored (snap stores the AI answer and the note in `snapHistory`).
- PDFs are parsed in the browser (`pdfjs-dist`, `lib/pdf/*`); server receives text or page images. `pdf-lib` is a dependency (usage not audited). Office parsing `lib/documents/office.ts`: Unknown depth (zip bombs, XML).
- Material ingest passes text through `sanitizeUntrustedPromptText` (strips script/iframe tags, scrubs PII, 30k cap).
- `stt`: 5 MB cap, shared limiter 15/min, client filename forwarded to Groq.
- `proxy.ts` `bodyTooLarge` reads only `Content-Length`; chunked bodies fall back to Next's `proxyClientMaxBodySize: 26mb`. Memory pressure with concurrency. Low.

### 3.6 Prompt injection
`lib/ai/scrub.ts` is PII scrubbing plus script-tag stripping; fencing is `fenceUntrusted` (`lib/ai/generate.ts`) and `wrapUserInput` (`lib/study/topic-source.ts`). Regexes cover emails, phones, SSN-style, "matric/id" tokens; they do not cover names, and the SSN pattern is irrelevant in Nigeria (no NIN/BVN pattern). Free-form AI output renders as safe Markdown; structured output is schema-validated. Impact is mostly content integrity, plus the simulation path in 3.1. Medium.

## 4. API abuse, rate limits, payments

### 4.1 Layers
1. `proxy.ts` baseline: 240 writes/min signed-in, 60 anonymous, per instance, keyed by unverified credential tail (S-02).
2. `checkRateLimit` per route: in-memory unless `shared: true` (13 uses of `shared: true` against about 151 `checkRateLimit` calls).
3. `checkRateLimitAndQuota` / `reserveQuota` (`lib/quota/guard.ts`): Firestore-shared per-minute counter (10/min students, 60/min teachers or plan-based when billing enforced) and transactional monthly reservations, settled or released. Falls back to per-instance if Firestore fails (logged). Good design.
- Unauthenticated endpoints (`auth/bootstrap`, `auth/session`, `client-errors`) key on spoofable IP off Vercel; `client-errors` writes a Firestore doc per request. Low.
- `aiCache` hits skip quota. `router.ts` (~lines 53-63) refuses to put learner DNA into any call that has a shared `cacheKey`, preventing cross-user leakage. Verified.

### 4.2 Paystack
- Webhook (`app/api/billing/webhook`, `lib/billing/paystack.ts`): HMAC-SHA512 of the raw body, constant-time compare, 401 on mismatch, 503 without secret. `readCharge` requires `charge.success`, status success, NGN, a plan in `PAYABLE`, amount at least list price. Idempotent: `payments/{reference}` created inside a transaction (`lib/billing/activate.ts`); replay returns `applied:false`. User id comes from metadata set by our own checkout. Verified, HIGH.
- `billing/verify` asks Paystack directly with the secret key and rejects another account's reference. Checkout limited to 6/min.
- Gaps: S-14 (refunds/disputes); `payments` keeps name and email forever; no reconciliation job; an activation for a missing user doc returns false and records nothing, so a payment for a deleted user is silently lost.

## 5. Privacy

### 5.1 Data collected
- Account: `users` (email, displayName, username, photo, role, institution, department, level, interests, plan, XP, streak, token usage), `avatars`, `pushTokens`, `deviceStats`.
- Learning: `learnerProfiles`, `mastery`, `evidence`, `mistakes`, `misconceptions`, `reviewLogs`, `practiceHistory`, `quizSessions`, `paperAttempts`, `snapHistory` (AI answer + student note), flashcards, `studyGoals`, `examPlans`, `diagnosticSessions`, `users.telemetryProfile` (dwell time, weak topics, cohort).
- Social: `chats`/`direct_chats` with messages, `friends`, `friend_requests`, `posts`, `comments`, `rooms` with `presence` and `messages`, `focusSessions`, `studyGroups`, `communities`, `explainers` (videos), `media`.
- Academic documents: `sources`, `sourceDocs`, notebook sources, class `materials`/`chunks`, `pastQuestions`.
- Money: `payments` (email, name, amount, channel). Ops: `usage`, `aiUsage`, `aiSpend`, `errorLogs` (IP, UA), `auditLogs`, `bugReports`. Schools: `schools` plus `users.schoolId`.

### 5.2 Sent to third parties
| Provider | What |
|---|---|
| Google Gemini | prompts, uploaded document text, homework photos, class material, Learner DNA, translations |
| Groq | fallback prompts, Whisper audio (`/api/stt`) |
| OpenRouter | fallback prompts (routes to many model vendors) |
| Microsoft Edge TTS (`edge-tts-universal`, unofficial client) | text read aloud (up to 1200 chars) |
| ElevenLabs | text for voice |
| Tavily / Brave | research queries |
| Paystack | email, uid, plan, amount |
| Firebase/Google, Vercel, optional Sentry | all app data and logs |
`scrubPii` runs only on some paths; chat, snap notes and many tutor messages are not scrubbed. Whether provider tiers train on inputs is Unknown. The Edge TTS client uses an unofficial endpoint (terms and availability risk).

### 5.3 Cross-user leakage
Shared caches: `aiCache` (caller-supplied key; DNA excluded), `ttsCache` (sha1 of slot+text, shared audio; reveals only that a text was spoken), `contentCache` (per class). `dnaCache` is keyed by uid. No leakage found. Visible to all signed-in users: displayName, username, XP, streak, role (`users/search`). `friends` API returns friends' emails.

### 5.4 Deletion, export, retention, consent
- Deletion: none (`deleteUser` never called; `scripts/purge-demo-data.ts` is a dev script). Export: none.
- Retention: no policy. TTL documented only for `rateLimits`/`quotaReservations`; chat, evidence, mistakes, payments kept indefinitely.
- Consent: signup/login pages have no privacy/terms text; no privacy page under `app/`; no age gate or guardian flow.
- School sponsorship shares study data with school managers without a prompt.

### 5.5 Nigeria Data Protection Act 2023 (NDPA)
Sources (secondary): FPF, "Nigeria's New Data Protection Act, Explained", https://fpf.org/blog/nigerias-new-data-protection-act-explained/ (fetched 2026-11-19); KPMG review https://kpmg.com/ng/en/insights/2023/08/nigeria-data-protection-act-2023-review.html (appeared in search 2026-11-19, not fetched). The official NDPC PDF (ndpc.gov.ng) returned HTTP 403 to my fetch, so I did not read the Act text itself. A web search summary says the NDPC issued the General Application and Implementation Directive (GAID) on 20 March 2025, replacing the NDPR 2019 framework (not independently checked).
Questions for counsel (not conclusions):
1. Children (s.31 per FPF): under 18; parental/guardian consent, verification and age checks where feasible; an education exception whose scope needs legal reading. Secondary schools are a target (`kind: secondary`); the app has no age or guardian flow.
2. Data subject rights (access, correction, erasure, objection, portability, consent withdrawal, limits on solely automated decisions): no mechanism exists. "Readiness" and "at-risk" flags shown to principals may be profiling.
3. Cross-border transfer (ss.42-43 per FPF): Google, Groq, OpenRouter, Microsoft, Vercel processing is outside Nigeria; a recorded basis is needed.
4. DPIA (s.28(1)): likely for children's learning profiles sent to AI.
5. Controller/processor of major importance: registration (s.44) and DPO (s.32) depend on NDPC thresholds.
6. Breach notification to the NDPC within 72 hours (s.40): no incident process in the repo.
7. Penalties up to the higher of 10M naira or 2% of prior-year revenue for major-importance controllers (per FPF).
Legal review is required on all seven.

## 6. Secrets, logging, headers
- Tracked-tree pattern scan (Google API keys, live-key prefixes, private-key blocks, Groq/OpenRouter/GitHub/Slack/AWS tokens): matches only in `docs/antigravity/PAYSTACK-SETUP.md` (placeholder), `lib/push/config-check.test.ts` (fake strings), a third-party file under `.agent/`, and the two APKs (an `AIza` string, probably the public Firebase web key; not verified). No real committed secret found. History (file-name level): `.env.example` is the only env file ever added; `git log -S"BEGIN PRIVATE KEY"` hits are in commits touching the CI mock key and docs, not inspected (Partially verified; run gitleaks or GitHub secret scanning for a full answer).
- `.gitignore` covers `.env*` (except the example) and `*.pem`; APKs are not ignored (S-06). CI uses a mock private key.
- `deploy-firestore.yml`: writes a service-account JSON to `RUNNER_TEMP` (0600), deletes it with `if: always()`, pins `firebase-tools@15.32.1`. `security-review.yml`: see S-17.
- Logging: 73 `console.*` calls in `app/` and `lib/`; `lib/auth/failures.ts` classifies auth failures. The only PII log found is client-side `native-google.ts` printing the email to the device console. `errorLogs` stores IP and UA; URLs and long tokens are scrubbed. AI prompts are not logged server-side (none found). Sentry PII settings: Unknown.
- Headers (`next.config.ts`): HSTS 2 years with includeSubDomains (no `preload`), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff, strict referrer policy, Permissions-Policy (mic self only), `object-src 'none'`, `base-uri 'self'`, no powered-by, no browser source maps. Weak: `unsafe-inline`/`unsafe-eval`, `img-src https:`, no nonce, no COOP.

## Open questions
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
