# Releasing Sunroot (web and Android app)

## What reaches people automatically
| Change | How it arrives | Their effort |
|---|---|---|
| Anything on the website (pages, Sprout, fixes, AI changes) | Merge to `main`, Vercel deploys. The Android app is a shell around the live site, so it shows the new version at once. | none |
| A page left open during a deploy | `NewVersionWatcher` notices the new deployment (`/api/version`), shows one line with **Refresh**, and refreshes by itself the next time the person changes page (never while typing). | none, or one tap |
| A broken saved copy after a deploy ("Failed to load chunk") | `lib/recover/chunk-error.ts` clears saved copies and reloads once. | none |
| A new Android shell (APK) | The app checks `public/app-version.json` when it opens, when it comes back to the screen, and every 6 hours while open. It shows what is new, downloads inside the app with progress, and opens Android's installer. | one tap on **Install** |

Android does not let an app install itself silently outside Google Play, so the last step is always one tap. Real silent updates need Google Play (internal testing first, then production, with in-app updates).

## Shipping a new APK
1. Raise `versionCode` (a whole number, always higher) and `versionName` in `android/app/build.gradle`. Sign with the same key as the installed app.
2. Upload the APK to a **GitHub Release** (not to `public/`): `https://github.com/shamzrepha/synapta/releases/download/<tag>/<file>.apk`.
3. `npm run release:app -- --code 9 --name 2.7 --url <that link> --notes "one short line about what is new" [--min 8]`
   It refuses a version that does not go up, a download link that is not ours, and a required-update floor above the release.
4. Merge the change to `main`. Phones see it within 6 hours or at their next launch.
5. Test on a real phone: install the previous build, open it, you should see the banner with your notes, press **Update**, tap **Install**, reopen: the build number in Settings is the new one.

## `public/app-version.json`
```json
{ "versionCode": 9, "versionName": "2.7", "url": "https://github.com/shamzrepha/synapta/releases/download/v2.7/sunroot-2.7.apk", "minVersionCode": 8, "notes": "Focus sprints and faster lessons" }
```
- `versionCode`: what the app compares with its installed build. Must go up with every APK.
- `minVersionCode` (optional): installed builds below this get a **required** update (no "later"). Use it for a breaking server change or a security fix. Leave it out for a normal update.
- `notes` (optional, 160 characters): shown in the banner.
- `url`: only `sunrootlearn.vercel.app/*.apk` or this project's GitHub release downloads are accepted; anything else is ignored by the app.

## Rolling back
- Web: promote the previous deployment in Vercel (Deployments, the older one, Promote). Open pages offer a refresh by themselves.
- APK: you cannot downgrade an installed app. Publish the fixed build with a higher `versionCode`. To pull a bad release immediately, set `public/app-version.json` back to the previous `versionCode` so no more phones offer it.

## Keeping the repo healthy
Never commit an APK to `public/` (it stays in git history forever). The native updater plugin (`docs/antigravity/ANDROID-AUTO-UPDATE-PLUGIN.md`) downloads straight from the release link.

## Compatibility rules (so old apps keep working)
- Add to API responses, do not rename or remove fields an installed app may read. If you must, raise `minVersionCode` first and wait for people to update.
- The app reads only `build` from Capacitor `App.getInfo()` and `public/app-version.json`; keep both stable.
- New browser features go behind a check (`"caches" in window`, `matchMedia`), because the Android WebView can be several versions behind Chrome.
