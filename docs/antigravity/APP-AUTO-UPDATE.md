# Android app: stop needing a new APK for every change, and never get stuck on "Failed to load chunk" (for Antigravity)

Project: `sunroot-mobile` (Capacitor). The website is at https://sunrootlearn.vercel.app and deploys on every merge to `main`.

## What the founder sees
1. Every fix needs a new APK download.
2. One day the app stopped opening with: `Failed to load chunk /_next/static/immutable/chunks/3tqc9u5-q01tg.js from module 964893`. The website kept working. (I checked: that file is served by the live site, HTTP 200, so the phone was using a saved copy or lost the connection.)

## Why (from what is in the repo; confirm it in the native project)
`main` now carries four APKs in `public/` (about 10 MB each) and `public/app-version.json`, and earlier notes mention "embedded web assets" and a "self-updating continuous-cache runtime". If the APK carries its own copy of the site, or caches the site's HTML/JS itself, the app shows an old page whose file names (`/_next/static/...`) were replaced by the next deploy. That is exactly this error, and it also means every web fix needs a new APK.

## Target design (do this)
**The app is a thin shell that always opens the live site.** Web fixes then reach every phone the moment they deploy, with no new APK.
1. `capacitor.config`: `server: { url: "https://sunrootlearn.vercel.app", allowNavigation: [...] }`. Keep the same `allowNavigation` list as before.
2. `webDir` holds only a tiny `index.html`/`offline.html` (logo, "No connection", a **Try again** button that reloads). Do **not** copy `.next`, `out`, or any `/_next/static` files into `android/app/src/main/assets/public`.
3. Remove the "continuous-cache" layer: no `shouldInterceptRequest` caching of pages, scripts or `/_next/static/*`; no custom file cache. The site already has its own offline worker (`public/sw.js`); do not duplicate it.
4. WebView cache mode: default (`LOAD_DEFAULT`). Never `LOAD_CACHE_ELSE_NETWORK` or `LOAD_CACHE_ONLY`.
5. When the app is updated to a new `versionCode`, clear the WebView cache once on first launch (`webView.clearCache(true)`; remember the last `versionCode` in SharedPreferences).
6. Load errors: handle `onReceivedError` / `onReceivedHttpError` for the main frame by showing the bundled `offline.html` (never a raw error), and retry when the network comes back (`@capacitor/network`).
7. Add `@capacitor/app` (the website's update banner reads `App.getInfo().build`), and keep `android/app/build.gradle` `versionCode` equal to `versionCode` in `public/app-version.json`. **Increment it on every APK you publish.**

## The update banner (already built into the website)
`components/shell/app-update-banner.tsx`: inside the app only, it reads `/app-version.json` (served `no-store`), compares `versionCode` with the installed build, and shows "A new version of Sunroot is ready. [Update]". The link must be an `.apk` hosted on `https://sunrootlearn.vercel.app/` **or** `https://github.com/shamzrepha/synapta/releases/download/<tag>/<file>.apk`; anything else is ignored.
Android does not allow an app to install itself silently outside Google Play, so this is one tap, not zero.

## Real automatic updates: Google Play
Publish an **AAB** to Play (internal testing, then production). Then add Play in-app updates (for example `@capawesome/capacitor-app-update`, flexible update) so phones update in the background. Sideloaded APKs can never do this.

## Keep the repo healthy
Do not commit APKs into `public/` any more (4 files at about 10 MB stay in history forever). Attach each APK to a **GitHub Release** and put that release URL in `public/app-version.json` (`url`). Delete the old `public/sunroot-*.apk` files once the landing-page button points at the release.

## Vercel (founder)
If the Vercel plan offers **Skew Protection** (Project Settings, Advanced), turn it on: it keeps the previous deployment's files available so a phone holding an older page doesn't hit missing files while it refreshes.

## Test (real phone)
1. Install the new APK once.
2. Merge a visible change on the website (for example a changed word on the dashboard) and wait for Vercel.
3. Force-close and reopen the app. The change must be there with **no reinstall**.
4. Turn on airplane mode and open the app: you get the offline page with **Try again**, not an error. Turn the network on and tap it: the app loads.
5. Publish a new APK with a higher `versionCode` and update `app-version.json`: the old app shows the update banner.

## Report back
Whether the APK bundled web files or cached pages (and what you removed), the versionCode in `build.gradle`, and results of tests 3 to 5.
