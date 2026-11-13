# Prompt for Antigravity: build, sign and ship Sunroot Android 3.0 (copy everything below the line)

---

You are the release engineer for SunrootLearn (repo `shamzrepha/synapta`, live site https://sunrootlearn.vercel.app, `main` auto-deploys on Vercel). Goal: compile the fixed native Android app as **version 3.0**, publish it, put the download link on the landing page, and make every installed copy see an update. Work step by step and report real results, not assumptions.

## 0. Read first
1. `git pull` on `main`. Read `CLAUDE.md`, `docs/RELEASING.md`, `docs/antigravity/ANDROID-KEYBOARD.md`, `docs/antigravity/ANDROID-REVIEW.md`, `docs/antigravity/ANDROID-AUTO-UPDATE-PLUGIN.md`, `docs/antigravity/APP-AUTO-UPDATE.md`.
2. Current state: `public/app-version.json` says versionCode 9 / versionName 2.7. The landing page (`app/(marketing)/page.tsx`) links `/sunroot-2.7.apk`. The native project lives outside this repo in `sunroot-mobile` (on the founder's PC: `C:/Users/shamz/Downloads/sunroot-mobile/android`, files `app/build.gradle`, `AndroidManifest.xml`, `MainActivity.java`). The native app is a Capacitor shell around the live site.

## 1. Apply the native fixes (in `sunroot-mobile/android`)
Do exactly what the three docs say and tell me which parts were already done:
- **Keyboard / blocked screen** (`ANDROID-KEYBOARD.md`): `windowSoftInputMode`, edge-to-edge / inset handling in `MainActivity.java`, so the page stays usable and the focused field scrolls into view when the keyboard opens.
- **Review items** (`ANDROID-REVIEW.md`): fix every item still open.
- **Native update plugin** (`ANDROID-AUTO-UPDATE-PLUGIN.md`): the in-app updater downloads the APK with progress, then opens Android's installer. Add the `REQUEST_INSTALL_PACKAGES` permission and the `FileProvider` entries it needs.
- Raise the version in `app/build.gradle`: **`versionCode 10`, `versionName "3.0"`** (versionCode must be higher than the 9 on main). Do not change `applicationId`.
- Sync the web assets: `npx cap sync android`.

## 2. Build and sign
- Build a **release** APK (`./gradlew assembleRelease`) signed with the **same keystore** as the installed 2.x apps. If you use a different key, phones cannot update in place: stop and tell me instead of continuing.
- Never commit the keystore, its passwords, or `local.properties`. Never paste them in chat or logs.
- Name it `sunroot-3.0.apk`. Record its size and `sha256sum`.
- Verify: `apksigner verify --print-certs sunroot-3.0.apk` shows the same certificate fingerprint as the 2.7 APK (`apksigner verify --print-certs public/sunroot-2.7.apk`).

## 3. Test on a real phone (or an emulator if no phone)
1. Install 2.7, sign in, then install 3.0 **over** it: still signed in, no reinstall needed.
2. Open any text field: the keyboard opens, nothing is blocked, the field is visible, the Sprout and overlay buttons do not cover content or the keyboard.
3. Install 2.7 again, publish the manifest (step 5) to a staging copy or wait for deploy, reopen: the update banner shows "3.0" with the notes, Update downloads with progress, Install opens Android's installer, after reopening Settings shows version 3.0.
4. Rotate the screen, go offline, press Back: no crash.
Record pass or fail for each item.

## 4. Host the APK so a stranger can download it
- Create a **GitHub Release** `v3.0` on `shamzrepha/synapta`, attach `sunroot-3.0.apk`, notes = the short line below.
- **Check that an anonymous user can download it** (this matters: a private repository hides release files): `curl -sIL https://github.com/shamzrepha/synapta/releases/download/v3.0/sunroot-3.0.apk | head -20`, expect a final 200 (a 404 means private).
- If it works: use that URL everywhere below. If it does not (private repo): put the file at `public/sunroot-3.0.apk` instead and use `https://sunrootlearn.vercel.app/sunroot-3.0.apk` (the app's allowed-URL rule accepts both). In that case remove the older `public/sunroot-2.*.apk` files and `public/sunroot.apk` from the tree in the same change, and say so, because APKs should not pile up in git.

## 5. Update link (what installed apps read)
```
npm run release:app -- --code 10 --name 3.0 --url <the download URL> --notes "Sprout everywhere, live 3D labs, smoother keyboard and one-tap updates."
```
Do **not** add `--min` (no forced update). It must refuse nothing; if it errors, fix the cause, do not edit `public/app-version.json` by hand. Confirm the file now says versionCode 10, versionName "3.0".

## 6. Landing page download link
- In `app/(marketing)/page.tsx` change the Android button to the new link, label **"Download for Android (v3.0)"**, keep `download` and the existing styling. Show the file size next to it if one line allows (use the real size from step 2).
- Make the link stable for the future: add a public route `/download/android` that redirects (HTTP 302) to the `url` in `public/app-version.json`, and have the landing page link point at `/download/android`. Follow the rules for public routes in `app/api/route-guards.test.ts` / `CLAUDE.md` (it must not leak anything else, and it must keep working when the manifest changes).
- Update every other place that names 2.7 (Settings version card, tests, docs, README). `grep -rn "2\.7\|sunroot-2" --include=* . | grep -v node_modules`.
- Bump the web `version` in `package.json` to 3.0.0 if the app shows it.

## 7. Ship the web side
Before every push: `npx tsc --noEmit`, `npx eslint .` (0 errors), `npx vitest run`, `npm run check:guards`, `npm run check:models`, `npm run build`. Read the real counts. Never commit `AGENTS.md`, keystores or `.env*`. Open a PR, wait for CI green, merge to `main`, let Vercel deploy.

## 8. Verify live (copy the real output into your report)
- `curl -s https://sunrootlearn.vercel.app/app-version.json` shows 10 / 3.0 and the right URL.
- `curl -sIL https://sunrootlearn.vercel.app/download/android` ends at a 200 for an `.apk` with the size from step 2.
- Download that APK again and compare `sha256sum` with step 2.
- Open the landing page on a phone-sized viewport: the button is visible, correct, not overlapping anything.

## 9. Report back
List: the final links (landing, direct APK, manifest), APK size and sha256, the signing certificate fingerprint (public info, fine to share), the test results from step 3 (pass/fail each), the PR link, and anything you could not do (and why). If any step failed, say so plainly instead of hiding it.

## Do not
- No forced update (`minVersionCode`) unless I ask. No new permissions beyond the ones the docs list. No store listing. No secrets anywhere. No force-push.
