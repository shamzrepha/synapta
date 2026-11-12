# Android shell review: what to check in `sunroot-mobile` (for Antigravity)

The native project is on the founder's PC (`C:/Users/shamz/Downloads/sunroot-mobile/android`) and was **not readable from the cloud session**, so this is a checklist built from what the website now expects, not a review of those files. Please go through it and report back which lines were missing.

## `android/app/build.gradle`
- `versionCode` must equal `versionCode` in `public/app-version.json` (now **8**, `versionName` 2.6). The website's update banner compares them. If the installed build is lower, the banner shows; if the APK was built with a higher number than the JSON, the banner never appears again until the JSON is raised.
- Increase `versionCode` for every APK you publish and update `public/app-version.json` in the same change.
- `targetSdkVersion` 35 or higher forces edge-to-edge: see the keyboard note below.
- Release builds must be signed with the same key as the installed app, or Android refuses to install the update over it.

## `android/app/src/main/AndroidManifest.xml`
- `android:windowSoftInputMode="adjustResize"` on the main `<activity>`.
- To install an APK that the app downloaded: `<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />` and a `FileProvider` entry (`androidx.core.content.FileProvider`, authority `${applicationId}.fileprovider`, with an `xml/file_paths` that exposes the download folder). Without them "Open installer" does nothing.
- Deep links: every `<intent-filter>` with `android:autoVerify="true"` needs a matching `assetlinks.json` on the site, or the links open in the browser instead of the app.
- No `android:usesCleartextTraffic="true"` in release.

## `android/app/src/main/java/com/sunroot/app/MainActivity.java`
- **Downloads.** The website now downloads the update inside the app. Android's WebView does nothing with downloads unless the host sets a `DownloadListener`, and it cannot download `blob:` URLs at all without a JavaScript bridge. Either (a) add `webView.setDownloadListener(...)` that hands `.apk` URLs from `sunrootlearn.vercel.app` to `DownloadManager` and, when finished, opens it with an `ACTION_VIEW` intent using the FileProvider URI, or (b) expose a small `@JavascriptInterface` that receives the bytes and does the same. Until then the website's "Open installer" button may appear to do nothing on some phones.
- **Keyboard.** If `targetSdkVersion` is 35+, `adjustResize` is ignored: apply the keyboard height as bottom padding (see `ANDROID-KEYBOARD.md`) or use the Capacitor Keyboard plugin with `resizeOnFullScreen: true`.
- **Insets.** Status bar and navigation bar insets must be applied as padding to the web view, otherwise the page's bottom menu sits under the system gesture bar.
- Keep the WebView cache mode at `LOAD_DEFAULT` and clear the cache once when `versionCode` changes (see `APP-AUTO-UPDATE.md`).
- `WebView.setWebContentsDebuggingEnabled(false)` in release.

## What the website now does for the app (already merged)
- Floating things (Sprout, its menu, the tutor and read-aloud bar) hide while a text field is focused on a touch screen, and stand above the bottom menu and the player instead of on top of them.
- The in-app update banner no longer claims "update complete" after a download: it says "Downloaded, tap Install", because a web page cannot install an APK. The new version is in place only after the person installs it and reopens the app.
- Sprout's "Listen" uses the app's neural voice, never the phone's built-in robot voice.

## Repo hygiene
`public/sunroot-2.6.apk` (8.8 MB) was committed to `main`, against the project rule (APKs go to GitHub Releases, not `public/`). Move it to a Release, point `url` in `public/app-version.json` at the release asset, then delete the file from `public/`.

## Report back
Which items above were missing, the `versionCode` in `build.gradle`, and a short screen recording of: typing in the tutor chat, and pressing "Update in-app" on an older build.
