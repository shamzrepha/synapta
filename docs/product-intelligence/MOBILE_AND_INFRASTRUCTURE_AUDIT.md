# Mobile and Infrastructure Audit

Audit date: 2026-11-19. Read-only. Repo HEAD `e3eb258` (= `origin/main`). Live probes were plain GETs/HEADs against `sunrootlearn.com` and `sunrootlearn.vercel.app`.

Evidence labels: **Verified** (read in code or measured from a live response), **Partially verified**, **Assumption**, **Unknown**. Confidence: HIGH / MEDIUM / LOW / UNKNOWN.

**The Android project (`sunroot-mobile`) is not in this container.** Everything about it comes from the repo docs (`docs/antigravity/*.md`, `docs/RELEASING.md`), the web code that talks to the shell, and the public `app-version.json`. None of it is a review of the native code. `docs/antigravity/ANDROID-REVIEW.md` says the same about itself: it is a checklist, not a review.

---

## Executive summary (blunt)

1. **The Android app is a thin shell by design, so it is exactly as available as the website.** The only documented offline behaviour in the shell is a bundled `offline.html` with "Try again". Whether that exists in the shipped APK is **Unknown**.
2. **A student cannot realistically keep studying offline today.** There are two "Download for offline" buttons in the whole product (a notebook, a class topic). The service worker caches no page HTML except `/offline`. See section 1.7.
3. **Push notifications almost certainly do not work inside the Android app.** The code is browser Web Push (service worker plus FCM web token). `package.json` has no `@capacitor/push-notifications`. Android System WebView does not provide Web Push. Assumption, HIGH confidence on the code side, native side Unknown.
4. **`sunrootlearn.com` is not running `main`.** Live `app-version.json` there says versionCode 16, but `main` says 14. That matches commit `5e57ad4`, which exists only on `origin/ops/migrate-to-own-server`. Production on the real domain is an unmerged branch.
5. **`/api/version` reports `self-hosted` on the .com site because the Docker build never receives a real commit id.** The Docker `SOURCE_COMMIT` build argument defaults to the literal `self-hosted`. The "Sunroot was just updated" refresh banner therefore can never fire on the self-hosted site.
6. **Most expensive transfers (measured or derived):**
   - APK download in the page: 8.9 MB held in memory as a Blob.
   - `pdf.worker.min.mjs`: 1.26 MB raw, **380 KB over the wire** (measured).
   - `three.min.js`: 743 KB raw, 192 KB over the wire (measured).
   - Friends chat poll every 3 s with the whole message list.
   - Base64 audio in JSON.
   - The Firebase SDK chunk loaded on the public landing page: 649 KB raw, 195 KB over the wire.
7. **Observability is thin.** `SENTRY_DSN` is listed in `.env.example`, but no Sentry package or code exists. Errors go to Firestore via `/api/client-errors` and `console.*`. Nothing alerts.
8. **Single server, no rollback artefact, unverified Dockerfile.** CI never builds the image. Rollback is "flip DNS back to Vercel", which only works while Vercel is still being kept current.

---

## 1. Android shell

### 1.1 Is it truly a thin shell?

**Finding.** By documented intent, yes. In practice it is a thin shell plus unknown native extras.

**Evidence.**
- `docs/antigravity/APP-AUTO-UPDATE.md`: "The app is a thin shell that always opens the live site", `server.url`, `webDir` holds only a tiny `index.html`/`offline.html`, no `/_next/static` in `android/app/src/main/assets/public`, no custom file cache.
- `docs/RELEASING.md`: "The Android app is a shell around the live site, so it shows the new version at once."
- The same APP-AUTO-UPDATE doc says an earlier build **was not thin**: it mentions "embedded web assets" and a "self-updating continuous-cache runtime", and the founder hit `Failed to load chunk /_next/static/immutable/chunks/... from module 964893`. The doc asks the native project to confirm and remove that layer. Whether it was removed is **Unknown**.
- Web side: `components/auth/mobile-landing-redirect.tsx` sends the native app to `/dashboard` or `/login`. `lib/native/app-update.ts` reads `Capacitor.Plugins.App.getInfo().build`. The web code expects a custom plugin `Capacitor.Plugins.SunrootUpdater` (`nativeUpdater()`), so the shell is not purely stock Capacitor.
- `package.json` web side has only `@capacitor/core` and `@capgo/capacitor-social-login`. No `@capacitor/app`, `push-notifications`, `camera`, `network`, `filesystem`, `browser` or `keyboard`. Those would live in the native project. The brief `docs/antigravity/BUILD-THE-APP.md` lists them as plans, not facts.

**Status.** Partially verified (docs and web code only). **Confidence.** MEDIUM.

**Impact.** Every web change reaches phones immediately (good), but every web outage, slow chunk or bad deploy reaches them too. The shell adds no resilience of its own beyond an offline splash.

**Recommendation.** In the native repo, confirm in one afternoon: (a) `server.url` value and `allowNavigation` list, (b) no bundled `_next` files, (c) WebView `cacheMode`, (d) offline handler. Record the answers in `docs/antigravity/`.

### 1.2 Which domain does the installed app load?

**Finding.** Unknown, and it matters for the migration.

**Evidence.**
- The docs all say `server.url = https://sunrootlearn.vercel.app`.
- Live `https://sunrootlearn.com/app-version.json` (self-hosted site) says build 16 / "3.5": "Custom domain sunrootlearn.com migration + dual-origin navigation support." The release is at `github.com/shamzrepha/synapta/releases/download/v3.5/sunroot-3.5.apk`.
- `https://sunrootlearn.vercel.app/app-version.json` still says build 14 / "3.3" with an APK URL on vercel.app.
- So two sites serve two different update manifests. A phone on the Vercel origin is told 14 is latest; a phone on .com is told 16.

**Status.** Verified (live manifests); the shell's `server.url` is Unknown.

**Impact.** Phones with the old APK (server.url on vercel.app) keep loading the Vercel site, which is on `main` and would be the old stack. If Vercel is switched off, those phones break and cannot be told to update, because the update banner is served by the site they cannot load. This is the sharpest migration trap for installed users.

**Recommendation.** Keep Vercel serving `app-version.json` with the new versionCode and a `minVersionCode` that forces the update until the old origin can be retired. Do not cancel Vercel until the update floor has been the only thing phones see for weeks (suggested: until download counts on the v3.5 release show the base has moved).

### 1.3 Auth persistence and Google sign-in

**Evidence.** `lib/auth/native-google.ts`: on native it uses `@capgo/capacitor-social-login` (Credential Manager) with a hardcoded fallback web client id, then `signInWithCredential`. Cookie session described in `docs/antigravity/BUILD-THE-APP.md` B2: httpOnly, secure, sameSite=lax, 14 days; "Keep me signed in" off = browser-session cookie.

**Findings.**
- **The result of the native login, including the ID token, is logged to the console:** `console.log("[NativeAuth] Received SocialLogin result:", JSON.stringify(res))`. The WebView console is readable over USB debugging or in logs on a rooted device. Verified in code, MEDIUM impact, HIGH confidence. Delete the log (also the email log line).
- A non-persistent cookie (Keep-me-signed-in off) in a WebView survives only while the process lives. Android kills backgrounded WebView processes. Students who do not tick the box may be signed out when the OS reclaims memory on a 2-4 GB phone. **Assumption**, LOW-MEDIUM confidence.
- The Capacitor and social-login packages are imported statically in the web bundle, so web users download that code too (small, but unneeded).
- Cookies are per origin. Moving the app from `vercel.app` to `sunrootlearn.com` signs every phone out once (also requires `sunrootlearn.com` in Firebase Authorized domains; `docs/SELF-HOSTING.md` step 5.4 lists it).

**Status.** Verified (log), Assumption (cookie behaviour). **Recommendation.** Remove the logs; default "Keep me signed in" to on inside the native app.

### 1.4 Navigation, deep links, back button

**Evidence.**
- Back button: only specified in `BUILD-THE-APP.md` ("`backButton` -> `history.back()`, exit only on the dashboard"). No JS handling exists in the web repo (`git grep backButton|appUrlOpen` returns docs only). Implementation in the native project is **Unknown**.
- Deep links: `ANDROID-REVIEW.md` says every `autoVerify` intent filter needs `assetlinks.json`. **`https://sunrootlearn.com/.well-known/assetlinks.json` returns 404** (live) and `public/.well-known/` does not exist in the repo. So verified App Links cannot work; links open in the browser instead of the app. Verified.
- The Paystack return deep link `sunroot://plans?paid=1` is planned; whether it is implemented is Unknown.
- `allowNavigation` must include both `sunrootlearn.com` and `sunrootlearn.vercel.app` (and Firebase Auth/Google hosts) or external navigations jump out to Chrome. v3.5's note says "dual-origin navigation support" (Unknown whether complete).

**Impact.** Referral links (`/r/*`), class links and push-click links will open Chrome, not the app, until `assetlinks.json` is published with the signing certificate fingerprint. **Recommendation.** Publish `public/.well-known/assetlinks.json` (founder supplies SHA-256 of the release key, never invent).

### 1.5 File upload, camera, microphone, audio

**Evidence.**
- Camera and gallery use plain `<input type="file" accept="image/*" capture="environment">` (`app/(app)/study/snap/page.tsx`, `study/notes/page.tsx`, `studio/debug`, past-questions). That works in an Android WebView only if the shell implements `onShowFileChooser` and CAMERA permission. Capacitor's default bridge does handle it, but I could not verify it. No `@capacitor/camera` is used by the web code.
- Microphone: `components/tutor/voice-tutor.tsx` uses the browser SpeechRecognition API when present, else `MediaRecorder` plus cloud STT. Android WebView does not provide `SpeechRecognition`, so the shell uses the MediaRecorder path, which needs `RECORD_AUDIO` and a WebView `onPermissionRequest` grant. Unknown if granted.
- Security header trap: **`Permissions-Policy: camera=(), microphone=(self), geolocation=()`** (live, both domains). `camera=()` blocks `getUserMedia({video})` for every page. File-input capture is not affected, but any future live camera scan (planned in `BUILD-THE-APP.md` A3, "crop/deskew") will be blocked until this changes.
- Compression: `compressImage` is applied in `study/snap`, `worlds/uploader`, `studio/debug` and past-questions. I did not find it on the notebook file upload path (`study/notes`). **Unknown** whether raw 4-8 MB phone photos upload there. On 2G that is minutes per page.
- Audio playback: see 2.6; AI audio comes as base64 in JSON, not a stream.

**Status.** Partially verified.

### 1.6 Push notifications

**Finding.** Probably broken inside the app.

**Evidence.** `components/notifications/push-toggle.tsx` calls `Notification.requestPermission()`, `navigator.serviceWorker.register("/firebase-messaging-sw.js")`, `getToken(getMessaging(app), { vapidKey })` and marks `unsupported` when `"Notification" in window` or `serviceWorker` are absent. That is Web Push. `package.json` has no `@capacitor/push-notifications` or Firebase native config. `BUILD-THE-APP.md` plans `@capacitor/push-notifications` and `PUSH-NOTIFICATIONS-SETUP.md` covers only the web key/VAPID setup. Android System WebView has no Notification/Push API, so the toggle likely shows "unsupported" in the app.

**Status.** Partially verified (web code verified; native Unknown). **Confidence.** MEDIUM-HIGH. **Impact.** Streak reminders (the retention feature the cron jobs drive) cannot reach app users. **Recommendation.** Decide: native FCM token registration through a Capacitor plugin that posts the token to the same `/api/device` or notifications store. Check what `lib/notifications` and `app/api/device` accept first.

Also: `docs/antigravity/PUSH-NOTIFICATIONS-SETUP.md` restricts the Firebase browser API key by website to `sunrootlearn.vercel.app`. The new domain `sunrootlearn.com` must be added there (and to Authorized domains) or push and sign-in fail on the new site. Domain-restriction status in Google Cloud is **Unknown**.

### 1.7 Network failure, website unavailable, offline study

**What happens when the site is down.** Documented target: bundled `offline.html` with "Try again", retry on network return (`APP-AUTO-UPDATE.md` items 2 and 6). Whether implemented: **Unknown**. If the Vercel/Hetzner origin returns 5xx rather than failing to connect, `onReceivedHttpError` handling is needed; the doc asks for it.

**What the website does offline** (`public/sw.js`, `public/sw-policy.js`, `components/offline/*`, `lib/offline/*`, `app/(app)/offline/page.tsx`):

| Aspect | Reality | Status |
|---|---|---|
| Service worker registered | Only in the signed-in `(app)` layout (`OfflineManager`), only in production | Verified |
| Precache | Only `/offline` (`c.addAll(["/offline"])`) | Verified |
| `/_next/static/*` | Stale-while-revalidate into `sunroot-static-v4` | Verified |
| Page navigations | Network first. Offline falls back to a cached copy of that exact URL, else `/offline`. Normal page HTML is never stored by the worker | Verified |
| API GETs | Served from `sunroot-downloads` cache only if the student explicitly downloaded that URL; auth/session/token/me/uploads/jobs paths never cached | Verified |
| "Download for offline" buttons | Exactly two: `app/(app)/notebook/page.tsx` (`/api/notebooks/{id}`) and `classes/[classId]/topics/[kcId]/page.tsx` (`/api/classes/{classId}`) | Verified |
| Download also caches the page HTML (`cache.add(page)`) | Yes, best effort, at download time | Verified |
| Metadata | `localStorage` key `sunroot.offline.items` | Verified |

**Why offline study probably fails even for downloaded items** (Assumption, MEDIUM):
1. Opening a downloaded page offline works only for a hard navigation to the exact saved URL. In-app links use Next client navigation (RSC fetches, not `mode: navigate`), which the worker does not serve from cache.
2. The page then boots the auth provider and many `/api/*` calls (`/api/me`, session and game stats). The policy regex deliberately **never caches** those, so the app shell may redirect to login or show errors offline.
3. Quizzes, flashcards, "Teach me" lessons, past questions, simulations and AI features have no download path; AI cannot work offline at all.
4. Firestore offline persistence is not enabled in what I read (not checked in `lib/firebase/client.ts`; **Unknown**).
5. The offline banner and `/offline` page claim "These downloads still open" - an unproven promise.

**Answer: can a student keep studying offline?** Only in the narrow case of re-opening a hard-loaded, previously downloaded notebook or class, and I would not promise even that without a device test. For all other content: no.

**Offline-first priority list (recommendations):**
1. Notebook text and notes (already the only supported item; make it actually work end to end, test in airplane mode on a real phone).
2. Flashcards due today with offline answers synced later (BUILD-THE-APP A3 calls for this; no code found).
3. Class topic notes and quiz questions, with queued attempts.
4. The last-opened dashboard "study today" list.
Never offline: AI tutor, simulation generation, payments, social, admin.

### 1.8 Version checking and GitHub Releases

**Evidence.** `lib/native/app-update.ts`, `components/shell/app-update-banner.tsx`, `scripts/release-app.ts`, `docs/RELEASING.md`.
- Checks `/app-version.json` (`no-store`, confirmed live: `cache-control: no-store, max-age=0`) on open, on visibility, every 15 min timer gated by a 6-hour recheck; supports `minVersionCode` (forced update).
- URL allowlist: `sunrootlearn.vercel.app/*.apk`, `github.com/shamzrepha/synapta/releases/download/<tag>/*.apk`, `NEXT_PUBLIC_APP_URL`, or `window.location.origin`. `buildManifest()` refuses non-increasing versions.
- Install needs `REQUEST_INSTALL_PACKAGES` and a FileProvider plus the custom `SunrootUpdater` plugin; otherwise the page falls back to `fetch` of the APK into a Blob and an `<a download>` click (`openInstaller`). Without a `DownloadListener` the WebView does nothing with blob downloads (stated in `ANDROID-REVIEW.md`).

**Findings.**
- **Update path is weak on bad networks.** Fallback fetches ~8.9 MB (live `sunroot-3.3.apk`: `content-length: 8889184`) into browser memory with no resume. On 2G/3G that fails often and burns data.
- **The release URL on GitHub is a public download of a private-ish build.** Fine, but it cannot be rate-limited; a flaky GitHub CDN in Nigeria is a risk (Unknown).
- **Repo hygiene.** On `main`, `public/sunroot-3.2.apk` and `public/sunroot-3.3.apk` (8.9 MB each) are still committed, against `CLAUDE.md`. The ops branch removes them.
- **Staleness mismatch** between `main` and the ops branch manifests (section 1.2).
- **No real silent update.** Docs correctly state the Play Store path is the only silent one. No sign of a Play listing.

**Recommendation.** Make Play (internal testing then production) the main channel, keep GitHub Releases for sideloaders; prefer the native `SunrootUpdater` with resumable `DownloadManager`; show size and Wi-Fi hint before downloading.

### 1.9 How much of the web app works well on mobile?

**Unknown as measured; code signals only.** There is real mobile care: `KeyboardGuard`, safe-area guidance, WebView-compat notes in `RELEASING.md`, chunk-error recovery. Counter-signals: 29 `<img>` tags vs only 4 files using `next/image`; per-page heavy libraries (3D, Blockly, KaTeX); several 3 s / 5 s polls (section 2.5); a Sprout mascot with a 1 s interval and five global pointer listeners (`components/bot/bot-provider.tsx`) on every page. A real-device pass on a 2 GB Android (e.g. Tecno/Infinix class) is needed; none of that was possible here.

---

## 2. Low-data optimisation

All numbers below are measured from real responses unless marked **derived** (arithmetic from a measured number) or **unknown**. Measurements use `Accept-Encoding: br` and are of the **public landing page `https://sunrootlearn.com/`**. Authenticated pages could not be measured.

### 2.1 Landing page (measured)

| Item | Value |
|---|---|
| HTML decoded size | 147,845 bytes (vercel.app: 149,406) |
| HTML over wire (br) | 20,140 bytes (vercel.app: 21,233) |
| Referenced JS+CSS+font files | 32 (20 JS, 2 CSS, 10 font files) |
| Sum of those files, Brotli | **636,014 bytes** (about 621 KB) |
| Sum of those files, raw | 1,933,056 bytes (about 1.84 MB) |
| Plus HTML | about **656 KB over wire** to see the landing page, if all referenced assets load |
| Largest chunk | `3zev8lytexy3q.js`: 648,880 raw / 194,522 br. Contains Firestore and Identity Toolkit strings (Firebase SDK), so **an anonymous visitor downloads the Firebase SDK to read a marketing page** |
| Next largest | `05ag8rqhwn73b.js` 234,947 raw / 73,372 br; `1vvo05di5hq0u.js` 163,394 / 45,166; `0cz1d0mv5g_q7.js` 112,594 / 40,550 |
| CSS | `3cm_8y8v7xqgt.css`: 261,064 raw / 36,587 br (large single stylesheet; unused rules unknown) |
| Fonts | 10 woff2 files preloaded, 126 KB total (7.8 to 29.9 KB each); all marked preload so all fetched |
| `/login` HTML | 32,909 raw / 6,605 br |
| Images in landing HTML | 0 `<img>` tags in the home HTML; one preloaded `/logo-mark.svg` (955 bytes) |
| `public/landing/*.jpg` | six JPEGs, 115 KB to 257 KB each (about 1.04 MB total, measured on disk in repo); live `mastery.jpg` served by Cloudflare as `image/jpeg`, not WebP/AVIF |

These are caveats, not a Lighthouse score: they ignore runtime-loaded chunks, hydration cost and anything after first paint.

### 2.2 Compression and caching headers (measured, live)

| Resource | Compression | Cache-Control | Notes |
|---|---|---|---|
| `/` on .com | br (via Cloudflare) | `s-maxage=31536000` | `cf-cache-status: DYNAMIC` so Cloudflare does not cache HTML. On vercel.app: `public, max-age=0, must-revalidate`, `x-vercel-cache: HIT` |
| `/_next/static/chunks/*.js` on .com | br | `public, max-age=31536000, immutable`, `cf-cache-status: HIT` | Correct |
| `/sw.js` | br | `public, max-age=14400` | Cloudflare/origin default 4 h; a service-worker fix can take up to 4 h to be noticed. Vercel: `max-age=0, must-revalidate` |
| `/sim/three.min.js` | br, 192,264 B wire (743 KB raw) | `public, max-age=14400` | Not content-hashed; only 4 h cache on .com |
| `/pdf.worker.min.mjs` | br, 380,188 B wire (1,264,342 raw) | `public, max-age=0` | Revalidated on every use; each revalidation costs a round trip, and a full 380 KB on change |
| `/landing/*.jpg` | none (already JPEG) | `public, max-age=14400` | Not immutable |
| `/app-version.json` | br | `no-store, max-age=0` | Correct, deliberate |
| `/firebase-messaging-sw.js` | - | `no-cache, no-store, must-revalidate` | Correct |
| `/offline` | br | `s-maxage=31536000` | prerendered |

**Risk (Assumption, MEDIUM).** The prerendered HTML carries `s-maxage=31536000` on the self-hosted site. Today Cloudflare ignores it for HTML (`DYNAMIC`). If anyone adds a Cloudflare "Cache Everything" rule, or a Page Rule for speed, stale HTML will point at chunks that no longer exist after the next deploy, producing exactly the "Failed to load chunk" failure the docs describe. `SELF-HOSTING.md` step 5.3 says "leave the defaults"; add an explicit "do not cache HTML" note.

### 2.3 Heavy libraries and code splitting (code)

- `three`: statically imported in `components/studio/viewer3d.tsx`, `studio/export-stl.ts`, `teach/artifact3d-block.tsx`. A separate, un-bundled `three.min.js` is loaded from `/sim/three.min.js` (`lib/sim/runtime3d.ts`) for AI simulations; `public/sim/simkit3d.js` is 11 KB. So users can pay for two copies of Three.js in one session (npm `three` 0.186.1 inside a chunk plus the 743 KB public file). Whether the static importers are behind `dynamic()` could not be confirmed from the grep; one commit message ("Three.js dynamic split") suggests partial splitting. Status: Partially verified.
- `blockly`: lazy via `dynamic(..., { ssr:false })` in `studio/[id]/page.tsx` and `labs/interactive-studio-lab.tsx`. Good.
- `pdfjs-dist`: loaded with `await import("pdfjs-dist")` (`lib/pdf/extractor.ts`, `materialIngest.ts`). Good. Worker is the 1.26 MB file (380 KB br) fetched on first PDF.
- `katex`/`rehype-katex`: **static** imports in `components/markdown/markdown-renderer.tsx`, `rich-inline.tsx`, `lesson/interactive-note.tsx`. Every page with markdown pays for KaTeX even with no formula. Recommend dynamic import only when `$` is present.
- `mermaid`: in `package.json` (12.2.0) but **no import found in app/components/lib**. Either dead weight in `node_modules` (no bundle cost) or used from the AI-generated HTML. Unused dependency: remove after confirming.
- `recharts` (`components/dashboard/mastery-radar.tsx`, static) and `framer-motion` (five components, static) are loaded on the dashboard path.
- Firebase SDK reaches the public landing page (2.1).

### 2.4 Images

- Only 4 files use `next/image`; 29 raw `<img>` tags exist across app/components. 10 occurrences of `loading="lazy"`. No AVIF/WebP pipeline observed: `public/landing/*.jpg` are plain JPEG.
- Uploads: `compressImage` (max 1280-1800 px, quality 0.78-0.85) is used in snap, worlds uploader, studio debug and past questions, which is good for 2G. Not confirmed for notebook upload.
- `public/` weight: `pitch/` is 83 MB (two 37 MB MP4s, a 3.2 MB HTML, a 1.7 MB PNG). It is excluded from the Docker image by `.dockerignore` and returns 404 on `sunrootlearn.com` but is **200 on `sunrootlearn.vercel.app`** (37,025,288 bytes, measured). Anyone can pull 37 MB repeatedly from Vercel; this is an egress and cost risk, and `CLAUDE.md` already says keep the pitch brief out of `public/`.

### 2.5 Polling, listeners, background requests (code)

`git grep setInterval|refetchInterval` finds 26 non-test sites. The ones that run on a student's normal path:

| Where | Interval | Cost note |
|---|---|---|
| `app/(app)/friends/page.tsx:156` | **3 s**, `GET /api/messages/{uid}` returning the whole message list | Keeps running while the tab is hidden (no visibility check). Largest steady background cost: 20 requests/min per open chat |
| `components/labs/ai-simulation.tsx:188` | 5 s, up to 5 min | Bounded |
| `app/(app)/classes/[classId]/page.tsx:195` | polling during AI drafting | Bounded by state |
| `components/shell/app-update-banner.tsx:106` | 15 min timer, 6 h effective | Cheap (one small JSON) |
| `components/shell/new-version-watcher.tsx` | 10 min `GET /api/version` | Cheap; dead on self-hosted (section 3.2) |
| `components/shell/site-notice.tsx:29` | 5 min | Cheap |
| `components/studio/presence-bar.tsx:45` | 20 s heartbeat POST, plus a fetch on every selection change (600 ms debounce) | Only in Studio. Hidden tabs still call `refresh()` |
| `components/bot/bot-provider.tsx` | 1 s focus tick, 700 ms and 5 s UI timers, 6 global capture listeners | CPU/battery, not data; matters on 2 GB devices |
| `components/admin/admin-alerts.tsx` | 2 min | admin only |

Firestore real-time listeners (`onSnapshot`), three sites: `components/providers/realtime-provider.tsx` (one doc `userSignals/{uid}`, every signed-in user, on every page; on each event it can also fire `/api/me/game` and a DM-unread fetch), `lib/live/client.ts` (live class docs), and `app/(app)/lounge/[roomCode]/page.tsx` (room plus all messages; `messagesQuery` limit not read). One listener is cheap; the Firestore websocket/long-polling channel itself keeps a connection and a keepalive alive for the entire session, which is itself non-trivial on 2G.

Retry behaviour: no generic client retry/backoff wrapper found (`git grep retry|backoff` in `lib/api` shows only server `Retry-After` for AI quota). Clients mostly `catch(() => null)`, so on flaky networks results are silent failures rather than retries.

### 2.6 Audio and PDF

- **Audio is not streamed.** `app/api/tts/read/route.ts`, `notebook/voice/route.ts` return `{ audioBase64 }` in JSON, which costs 33% overhead and requires the entire clip before playback; `read-through.tsx` converts with `base64ToUrl`. Gemini TTS audio is converted from raw PCM to `audio/wav` (`lib/ai/voice.ts audioFromBase64`, default rate 24000). **Derived**: 24 kHz, 16-bit mono WAV is about 48 KB/s (about 2.9 MB per minute), or about 3.8 MB per minute after base64. Whether Gemini returns PCM or MP3 on the live path is **Unknown**; the Edge/OpenRouter paths return MP3. Per-class audio lessons are cached once per topic ("recorded once per topic and replayed by every learner"), which is good; per-sentence read-through is cached with `private, max-age=3600` only on one route.
- **PDF.** `pdf.worker.min.mjs` 1.26 MB (380 KB br) with `max-age=0` revalidation. PDF text extraction happens in the browser (`lib/pdf/extractor.ts`), so the student downloads the worker and then **uploads** the document (up to 25 MB per `BUILD-THE-APP.md`). Pre-extraction on-device saves AI cost but costs the worker download once; give the file an immutable hashed URL.
- **Simulation.** `public/sim/three.min.js` (743 KB raw, 192 KB br, `max-age=14400`) plus the AI-generated simulation payload. Not hashed, so cannot be immutable.

### 2.7 Most expensive transfer

By single-event size on a student path, ranked (measured where stated):
1. **Installing an APK update in-page: 8.9 MB** (measured on `sunroot-3.3.apk`), in memory, no resume.
2. **Uploading a document/photo up to 25 MB / 10 MB** (limit from docs; actual sizes depend on the student, notebook upload compression Unknown).
3. **AI-generated WAV audio ~3.8 MB/min after base64** (derived, conditional).
4. **First PDF: 380 KB worker (measured)**; first 3D lab: 192 KB (measured) plus any bundled copy.
5. **Landing page: about 656 KB wire (measured)**, mostly the Firebase SDK chunk (195 KB) and CSS (37 KB).
6. **Continuous: friends chat polling every 3 s.** Not a single big transfer, but unbounded over a session.

Cheapest big win: stop pushing 3 s chat polls and WAV audio, and make the first-visit JS leaner.

### 2.8 Recommendations (no app rebuild needed)

All are web-only changes shipped through the existing deploy; the shell picks them up instantly.

1. **Low-data mode (a setting, auto-suggested):** detect `navigator.connection.saveData`, `effectiveType` of `2g`/`slow-2g`/`3g` and `deviceMemory <= 2`; store a per-device preference. In low-data mode: no Sprout animation loop, no 3D/sim auto-load (tap to load), no audio auto-fetch, images off or tiny, no heartbeat/presence, chat poll 15-30 s only while visible, no mastery radar/charts, `prefers-reduced-motion` honoured.
2. **Make the shell cheap before sign-in:** move Firebase SDK out of the landing path (marketing pages should not import the auth provider); dynamic-import KaTeX; keep `framer-motion`/recharts off the first route.
3. **Cache headers via `next.config.ts`/Cloudflare:** hash or immutable-cache `pdf.worker`, `three.min.js`, `simkit3d.js`; set `Cache-Control: immutable` for hashed assets only; keep HTML uncached on Cloudflare.
4. **Audio:** serve MP3/Opus with `Content-Type: audio/mpeg` and range support instead of base64 JSON; a "text only" fallback; pre-generate and store per-topic audio (already done for class lessons) so each is a normal cacheable URL.
5. **Chat:** replace 3 s polling with the existing `onSnapshot` pattern (already used by the lounge) or pause polling when hidden and back off.
6. **Lightweight offline mode that does not rebuild the app:** extend the existing `downloadForOffline` with (a) a "Download for the week" button that stores the due flashcards, the notebook text and the lesson JSON in IndexedDB/Cache Storage, (b) a precached `/offline-study` route that reads only from local storage and never calls `/api/me`, (c) a queue for quiz/flashcard answers synced on reconnect, (d) a clear banner showing bytes and an eviction control. This is a PWA-level change; only the first install needs the shell, nothing in `sunroot-mobile` has to change except verifying `onReceivedError` shows the web `/offline`-style page.
7. **Remove committed weight:** `public/pitch/` (83 MB), `public/sunroot-3.*.apk` (on `main`), unused `mermaid` and the unhashed copies of Three.

---

## 3. Deployment and reliability

### 3.1 What the live responses show

| Probe | sunrootlearn.com | sunrootlearn.vercel.app |
|---|---|---|
| `server` header | `cloudflare` (origin hidden; Cloudflare proxy on). `x-nextjs-cache: HIT`, `x-nextjs-prerender: 1` | `Vercel`; `x-vercel-id: cle1::...`, `x-vercel-cache` HIT/MISS |
| `/api/version` | `{"ok":true,"data":{"build":"self-hosted"}}` | `{"ok":true,"data":{"build":"e3eb258a602c5be3a12339501617f8d3274969b8"}}` (equals current `main` HEAD) |
| `/api/health` | `healthy`, `service: synapta-platform`, `version: 1.0.0` | same |
| `/app-version.json` | build 16 / 3.5, GitHub release v3.5 | build 14 / 3.3, vercel.app APK |
| `/sunroot-3.3.apk`, `/pitch/*.mp4` | 404 (excluded from image) | 200 (8.9 MB / 37 MB) |
| HSTS | `max-age=63072000; includeSubDomains` (no `preload`) | same |
| CSP | identical on both (from `next.config.ts`) | same |
| `cf-ray` locations seen | CMH, ATL (US) | n/a |

Interpretation:
- `sunrootlearn.com` is served by the self-hosted container behind Cloudflare. The Cloudflare edge colo seen was in the US (CMH/ATL) from this probe location; the origin location is **Unknown** (the Hetzner location is not exposed). `alt-svc: h3` indicates Cloudflare QUIC to the client.
- `x-nextjs-cache: HIT` and `x-nextjs-prerender: 1` confirm a Next standalone server with its own ISR cache, not Vercel's.
- Both deployments exist at once and share the same Firebase backend (same `service`, same project).

### 3.2 Why `.com` says `self-hosted` and `.vercel.app` shows a commit (from the code)

- `app/api/version/route.ts` returns `process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || "dev"`.
- `next.config.ts` bakes `NEXT_PUBLIC_BUILD_ID` from `VERCEL_GIT_COMMIT_SHA` at build time.
- **Vercel** injects `VERCEL_GIT_COMMIT_SHA` automatically: a real commit.
- **Dockerfile** (`ARG SOURCE_COMMIT=self-hosted`, then `ENV VERCEL_GIT_COMMIT_SHA=$SOURCE_COMMIT`) sets that variable to the build argument. If the build platform does not pass `SOURCE_COMMIT`, the default `self-hosted` is used. On the live .com the result is the literal `self-hosted`, so the platform (Coolify) is not passing a real `SOURCE_COMMIT` into the build as an argument (or the toggle is off). **Status:** cause verified in code; the Coolify setting is Unknown.
- On `main` the Dockerfile sets this only in the build stage; the ops branch adds it to the run stage too (`5e57ad4`), which is what .com runs.

**Impact.** The client's `NEXT_PUBLIC_BUILD_ID` and the server's value are always both `self-hosted`, so `isNewBuild()` is always false. The "Sunroot was just updated" banner and auto-refresh-on-navigation from `components/shell/new-version-watcher.tsx` are **dead on the self-hosted site**. Also, `/api/version` cannot be used to confirm which commit is live, which makes rollback and incident response blind. Also, Next gives each build a different chunk set; with no skew protection, a student with a page open across a deploy will hit "Failed to load chunk" and will rely only on `recoverFromChunkError`.

**Recommendation.** In Coolify enable "Include Source Commit in Build" (or add a build variable `SOURCE_COMMIT`), confirm `/api/version` reports a 40-char hash, and add `/api/version` to the Uptime Kuma check. Consider `deploymentId` in `next.config.ts` for asset skew handling.

### 3.3 `sunrootlearn.com` is not `main`

**Evidence.** `git merge-base --is-ancestor 5e57ad4 origin/main` is false; `origin/ops/migrate-to-own-server` contains `5e57ad4` ("switch canonical domain to sunrootlearn.com, remove vercel.json crons, move APKs to GitHub Releases, expose SOURCE_COMMIT in Docker runtime") and is 1 commit ahead of and 1 behind `main`. The live `.com` manifest (`versionCode 16`, v3.5) matches that commit, not `main`.

**Status.** Partially verified (inference from matching manifests and missing APK/pitch). **Confidence.** MEDIUM-HIGH.

**Impact.** Fixes merged to `main` (for example `e3eb258`, the iPhone PDF fix) are **not** on the production domain unless the branch is rebuilt. The two sites will drift. Coolify's "auto-deploy on main" described in `SELF-HOSTING.md` step 7 is not what is happening. **Recommendation.** Merge the ops branch to `main` (it is a 1/1 divergence), point Coolify at `main`, confirm both sites report the same commit.

### 3.4 Dockerfile, `.dockerignore`, standalone output

**Evidence and findings (Verified from files).**
- Three-stage build on `node:24-bookworm-slim`; `npm ci` then `npm run build` (`next build`); runtime copies `.next/standalone`, `.next/static`, and `public`; non-root user; `HEALTHCHECK` hits `/api/health` every 30 s; `CMD node server.js`.
- `next.config.ts` enables `output: "standalone"` only when `SELF_HOST=1`; `outputFileTracingIncludes` for prompts and subject packs.
- `.dockerignore` excludes `.next`, `node_modules`, `.git`, `.env*`, `public/*.apk`, `public/pitch`, `docs/marketing`.
- **`.env.example` is allowed by `!.env.example`** but `.env.*` patterns exclude other env files, correct.
- `public/` still ships `three.min.js`, `pdf.worker.min.mjs`, six landing JPEGs.
- **CI never builds the Docker image** (`.github/workflows/ci.yml` runs `npm ci` and `npm run verify` only). A broken Dockerfile is discovered at deploy time. The doc itself says "Nothing here has been run on a real server yet" (although .com is live, so it has been run at least once).
- **`NEXT_PUBLIC_*` values are baked at build.** Changing any (for example `NEXT_PUBLIC_APP_URL`, VAPID key) requires a rebuild, not a restart.
- **No `restart` policy, no resource limits, no read-only filesystem** in the Dockerfile (Coolify may set some). No `HEALTHCHECK` for readiness vs liveness: `/api/health` returns static "healthy" and **does not check Firebase, Firestore, Gemini or disk**. A container that cannot reach Firestore reports healthy.
- `curl` is installed in the runtime image (needed for cron); `cron` itself is not, so scheduled jobs depend on Coolify Scheduled Tasks.

### 3.5 Environment variable names (no values)

**Build-time (baked into browser code; `Dockerfile` build args):** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `SOURCE_COMMIT`. Also `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` is read by `lib/auth/native-google.ts` but is **not** a Dockerfile `ARG`, so on self-hosted it silently falls back to the hardcoded client id in code (a public client id, not secret, but the override does not work).

**Runtime (secret):** `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `PAYSTACK_SECRET_KEY`, `CRON_SECRET`, `ADMIN_EMAILS`, `BILLING_ENFORCED`, `STUDENT_TOKEN_LIMIT`, `TEACHER_TOKEN_LIMIT`, `GEMINI_MODEL*` and `GEMINI_CHAIN_*`/`GEMINI_RPD_LIMITS` overrides, `SENTRY_DSN` (unused), `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (per `SELF-HOSTING.md`, not read by the code).

Note: `FIREBASE_ADMIN_PRIVATE_KEY` newline handling is a classic failure point. `NEXT_PUBLIC_APP_URL` is also used by the APK allowlist (`isAllowedApkUrl`).

### 3.6 Scheduled jobs (what replaces Vercel crons)

**Evidence.** `vercel.json` on `main` still defines two crons: `/api/jobs/streak-reminders` at `0 18 * * *` and `/api/goals/reminders` at `0 7 * * *`. The ops branch removes them. `lib/security/cron.ts` `isCronAuthorized(authorization)` requires `Authorization: Bearer $CRON_SECRET` using `timingSafeEqual`; no secret configured means no access. Used by `streak-reminders`, `goals/reminders`, `session-reminders`. `SELF-HOSTING.md` step 4 replaces them with Coolify Scheduled Tasks running `curl` inside the container.

**Findings.**
- **Whether the Coolify scheduled tasks actually exist: Unknown.** The doc is instructions; nothing in the repo proves they were added. A failed or missing cron means students silently get no streak reminders. There is no external heartbeat/"last run" record visible to the admin.
- **Double-sending risk:** `main` still has Vercel crons enabled. While the Vercel site stays deployed with `CRON_SECRET` and a Firebase Admin key, Vercel and Coolify may **both** run the same reminder jobs against the same Firestore, producing duplicate notifications (unless the job dedupes per day; `app/api/jobs/streak-reminders/route.ts` was not read in depth). Status: Assumption.
- `session-reminders` is optional (`*/5 * * * *`) and not in `vercel.json` at all; whether class-session reminders are actually scheduled anywhere is Unknown.
- Time zone: schedules are UTC (18:00 UTC = 19:00 WAT, 07:00 UTC = 08:00 WAT). Acceptable for Nigeria; not for other zones. Quiet hours (21:00-07:00) are in the brief but not provably enforced.

### 3.7 Background workers and job recovery (`app/api/jobs/resume`)

**Evidence.** `app/api/jobs/resume/route.ts` is a normal authenticated POST (`requireUser(req, ["teacher","admin"])`), `maxDuration = 60`. It only re-runs jobs whose Firestore status is `waiting_quota`, either one job on request, or a scan of the caller's classes (all classes for admins).

**Findings.**
- **There is no worker.** AI builds (`buildClassWithAi`, `analyzeMaterialAndRoute`) run inside the HTTP request that started them. If the container restarts or the deploy replaces it mid-build, the job stays in whatever state it was in (`running`/`drafting`) forever. The recovery route only picks up `waiting_quota`, so **crashed jobs are never recovered**. Verified from code.
- Recovery is **teacher-triggered**, not automatic: nothing calls `/api/jobs/resume` on a schedule (Coolify tasks listed in the doc do not include it). A job that is `waiting_quota` waits until a teacher clicks "Resume now".
- Batch mode scans every class of the caller (or all classes for admin) and sequentially runs AI work inside one request; with a long list this can exceed any proxy timeout (Cloudflare closes idle origin connections at about 100 s on the free plan; **derived from Cloudflare's documented default, not measured here**), and Next on Vercel enforced 60 s, but self-hosted does not enforce `maxDuration`.
- `maxDuration = 60` has no effect on self-hosted Node, which is not a problem in itself, but means a single slow request can pin a worker thread for minutes.
- Deploys during a build are not graceful: Docker `stop` default is 10 s and Node `server.js` standalone has no SIGTERM draining beyond Next's default.

**Is the background job system reliable?** No. It is a best-effort request-driven pattern with no heartbeat, no stuck-job reaper, no retry counter and no admin view of failures that I could see. For a free-quota product this is tolerable for now, but classes built during a deploy will be stuck.

### 3.8 Health checks, logs, monitoring, error tracking

- `/api/health` (`app/api/health/route.ts`) returns static JSON with the timestamp and `npm_package_version || "1.0.0"` (live shows `1.0.0`, so it is not a real version). No dependency checks. Good as a process-up probe; useless as a "can the app serve students" check. Both domains return identical output.
- Logs: `console.*` only (about 9 `console.error|warn` hits in `app/api`), plus `/api/client-errors` which writes scrubbed browser errors to Firestore (rate-limited 10/min). On Coolify, logs live in the container/Coolify UI; there is no retention, search or alerting. No structured logger.
- **Error tracking: none.** `SENTRY_DSN` appears only in `.env.example` and `SELF-HOSTING.md`; `package.json` has no Sentry package, and no source file references it. `BUILD-THE-APP.md` Part E asks for Sentry; not done.
- Monitoring: `SELF-HOSTING.md` step 7 says "add a free uptime check (Uptime Kuma)". Whether it exists is Unknown. Hetzner backups are mentioned; no application-level backup (Firestore is the data store; `deploy-firestore.yml` deploys rules/indexes only). No Firestore scheduled export or restore drill visible (`docs/ops/RUNBOOK.md` does not exist; `docs/` has no `ops` folder).

### 3.9 SSL, proxy, Cloudflare

- Live: Cloudflare proxy in front (`server: cloudflare`, `cf-ray`), `alt-svc: h3`, HSTS 2 years with `includeSubDomains`, no `preload` token. TLS mode in the dashboard (should be Full strict) is Unknown.
- NEL reporting is on (`report-to: cf-nel`).
- Cloudflare caches static chunks (`HIT`), not HTML (`DYNAMIC`), not APIs; matches the guide.
- Risks: a Cloudflare 100 s origin timeout vs long AI requests (section 3.7); real client IP for rate limiting depends on `CF-Connecting-IP`; `lib/rateLimit.ts` is in memory (resets on restart; default is per instance) unless `shared: true` uses Firestore per call. Not verified that the IP key uses the Cloudflare header.
- `frame-ancestors 'none'`, `X-Frame-Options: DENY`: the site cannot be embedded; fine.
- CSP `connect-src` lists `*.googleapis.com`, `*.firebaseio.com`, `identitytoolkit`, `securetoken`, `generativelanguage` only. There is no `wss://*.firebaseio.com` explicit entry (covered by the wildcard host form for wss in modern browsers, but older WebViews are stricter; Unknown) and no Paystack or Cloudflare Insights host, so a payment popup or analytics script would be blocked by CSP. Test checkout once on the new domain.

### 3.10 Rollback

- Documented web rollback is Vercel's "promote previous deployment" (`docs/RELEASING.md`) or DNS back to Vercel (`SELF-HOSTING.md` step 6.3). On Coolify there is no documented image rollback: no tagged images, no registry, rebuild from git each time (build takes minutes and needs 4-8 GB). A bad deploy on the self-hosted site means either "revert commit and wait for a rebuild" or flip DNS to Vercel (which only works if Vercel is deployed from a compatible `main`, and which signs users out because cookies are per origin).
- APK rollback: cannot downgrade; lower `versionCode` in the manifest to stop offering. OK.

### 3.11 Single-server risks and memory

- One Hetzner box runs Coolify, Traefik/proxy, the build and the app. During a build, the app competes for the same RAM. `SELF-HOSTING.md` states a 4 GB build "did run out of memory in testing", recommends 8 GB or 4 GB + 4 GB swap. No `NODE_OPTIONS=--max-old-space-size` is set anywhere (`package.json` `build` is `next build`). I did not run a build (rule), so peak memory is **Unknown**. Docker also builds with `npm ci` of a large dependency tree (firebase, blockly, mermaid, three, pdfjs, recharts).
- Swap on SSD makes builds slow and can stall the live app while building (OOM killer may kill the running container instead of the build).
- No second server, load balancer or standby. Next's in-memory ISR cache and in-memory rate limits are per process. A restart loses both.
- Server patching, Docker disk growth (old images), Coolify itself, and Hetzner firewall are manual (`SELF-HOSTING.md` step 7 monthly `apt upgrade`).
- Latency: students are mostly in Nigeria/Africa per the brand brief. Hetzner has no African region; Cloudflare edge helps static files only. Dynamic requests go to Europe/US plus Firestore. **Unknown** measured TTFB from Africa; could not measure.

### 3.12 What could fail during or after the Hetzner migration

1. **Old APKs on `vercel.app`** lose their site if Vercel is retired (1.2).
2. **Forced sign-out** on origin change (cookies are per origin); Firebase Authorized domains and the API-key HTTP referrer restriction must include `sunrootlearn.com`; PUSH doc lists only vercel.app.
3. **Production runs an unmerged branch** (3.3); drift and double maintenance.
4. **Cron jobs missing or duplicated** (3.6).
5. **Paystack webhook URL** must be changed (`SELF-HOSTING.md` step 6.2) or payments won't activate plans; the secret stays the same key. Verification of a live webhook delivery is Unknown.
6. **`NEXT_PUBLIC_APP_URL`** drives canonical URLs, sitemap, share cards, the APK allowlist; wrong build arg = wrong links. It was changed on the branch but baked at build time.
7. **Build OOM / swap stalls** on a 4 GB server.
8. **No staging**: no preview URLs (Vercel previews gone); `test.sunrootlearn.com` is the only test target.
9. **Egress and DDoS exposure on a single IP** (Cloudflare proxy helps; origin IP leakage via DNS history means Hetzner firewall should allow only Cloudflare ranges on 80/443; not stated in the guide).
10. **Silent failure of `/api/version`** (3.2) and chunk errors after deploys.
11. **No error tracking**: failures after the move will be seen only by users.
12. **Pitch/APK assets** removed from the image (docs acknowledge); any link to them breaks on .com (APK links now point at GitHub, fine).
13. **Same Firebase project** shared with Vercel: if a second app instance with a different `CRON_SECRET` also runs jobs, behaviour is undefined (3.6).
14. **File uploads up to 26 MB** (`proxyClientMaxBodySize: "26mb"`) go through the single Node process; Cloudflare free plan has a 100 MB body limit so it is fine, but slow phone uploads tie up Node connections.

### 3.13 Is the app ready for intermittent connectivity?

No. Positive pieces: service worker for static chunks, a global offline banner (`OfflineManager`), chunk-error recovery, `app-update-banner` skips marking a check as done when offline, `NewVersionWatcher` ignores offline. Missing: client request retry/backoff, an offline write queue, Firestore offline persistence (unverified), offline-capable study content beyond two buttons, a Save-Data/low-bandwidth mode, resumable uploads, and a visible "slow connection" state. Most failures are swallowed with `.catch(() => null)` and show an empty UI.

---

## Prioritised recommendations

| # | Action | Why | Effort |
|---|---|---|---|
| 1 | Merge `ops/migrate-to-own-server` to `main` and deploy `.com` from `main` | Production not on main; fixes missing | Low |
| 2 | Pass a real `SOURCE_COMMIT` into the Coolify build; verify `/api/version` | Re-enable update banner, blind rollbacks | Low |
| 3 | Confirm Coolify scheduled tasks exist; stop duplicate Vercel crons | Reminders silently missing or doubled | Low |
| 4 | Keep Vercel serving `app-version.json` with `minVersionCode`; do not retire it before phones move | Old APKs strand | Low |
| 5 | Publish `assetlinks.json`; add `sunrootlearn.com` to Firebase Authorized domains and the API key referrers | Deep links, sign-in, push | Low |
| 6 | Remove the `JSON.stringify(res)` token log in `native-google.ts` | Token in console | Trivial |
| 7 | Add Sentry (or equivalent) and a real `/api/health` (Firestore reachability) | No visibility | Medium |
| 8 | Native push via a Capacitor plugin that registers an FCM token | Web Push does not work in WebView | Medium (native) |
| 9 | Low-data mode plus cheaper first load (drop Firebase from landing, lazy KaTeX, hashed immutable `pdf.worker` and `three`) | 2G/3G students | Medium |
| 10 | Real offline reader: notebook, due flashcards, answer queue, offline-safe route | Core study continuity | Medium |
| 11 | Docker build in CI; image tagging for rollback; Docker `--stop-timeout`; Firestore export schedule | Reliability | Medium |
| 12 | Job reaper and an automatic `waiting_quota`/stuck-job scheduled call | Stuck builds | Medium |
| 13 | Delete `public/pitch/` (83 MB) and committed APKs from `main`; stop serving the 37 MB MP4 from Vercel | Egress and repo hygiene | Low |

---

## Open questions

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
