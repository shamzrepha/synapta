# Android app: make Google sign-in, payment and phone layout work (for Antigravity)

Project: `C:\Users\shamz\.gemini\antigravity\scratch\sunroot-mobile` (Capacitor, loads https://sunrootlearn.vercel.app).
The website side is already done and merged. **Only the native side below is left, and it needs a rebuild.** Do not put keys in git or chat.

## What the website now does (no change needed from you)
- **Google sign-in:** inside the app it calls the native plugin `FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })`, takes the returned `credential.idToken`, and signs Firebase in with it. In a normal browser it still uses the popup. If the plugin is missing, the login page says "Google sign-in isn't set up in this version of the app yet. Use email and password, or update the app." (Google refuses OAuth inside an embedded web view, which is why the popup/redirect never works in the APK.)
- **Payment:** the Upgrade button opens Paystack in the phone's browser tab using the `Browser` plugin, remembers the payment reference, and when you return to the app (focus / visibility) it asks the server to confirm the payment and shows "Payment received". No deep link is required for this to work.
- **Phone layout:** `viewport-fit=cover` and safe-area padding are in the site; the top bar, bottom bar and account menu were reworked for phones.

## 1. One id everywhere (check this first)
`MainActivity.java` lives in package `com.sunroot.app`, but an earlier commit says the app id is `com.sunroot.learn`.
Pick **one** and make all of these identical, or sign-in will fail with "developer error" (code 10):
`applicationId` in `android/app/build.gradle` = `appId` in `capacitor.config.*` = package name registered in the Firebase console = the Java package folder = the Play Console app.

## 2. Install the plugins (PowerShell, in the project root)
```
npm i @capacitor-firebase/authentication @capacitor/browser @capacitor/app @capacitor/status-bar
npm i firebase
npx cap sync android
```

## 3. `capacitor.config.ts` (merge into what exists)
```ts
server: {
  url: "https://sunrootlearn.vercel.app",
  allowNavigation: ["sunrootlearn.vercel.app", "*.firebaseapp.com", "accounts.google.com", "*.paystack.co", "*.paystack.com"],
},
plugins: {
  FirebaseAuthentication: { skipNativeAuth: true, providers: ["google.com"] },
  StatusBar: { style: "DARK", backgroundColor: "#12241C", overlaysWebView: false },
},
```
(`skipNativeAuth: true` matters: the website signs Firebase in itself from the idToken.)

## 4. Firebase console (ask the founder to do this part, or do it with their login)
1. Project settings > Your apps > **Add app > Android** with the exact id from step 1.
2. Add the **SHA-1 and SHA-256** fingerprints:
   - debug: `cd android; .\gradlew.bat signingReport` (copy SHA-1/SHA-256 for `debug`);
   - release: from your release keystore (`keytool -list -v -keystore <file>`);
   - if you publish on Google Play with Play App Signing: also the fingerprints from Play Console > Setup > App signing.
3. Authentication > Sign-in method > **Google: enabled**.
4. Download **`google-services.json`** and put it in `android/app/` (it is a config file, not a secret, but keep it out of the public repo if the repo is public).
5. In `android/build.gradle` add `classpath 'com.google.gms:google-services:4.4.2'` (Capacitor's template applies the plugin in `android/app/build.gradle` automatically when the file exists; if not, add `apply plugin: 'com.google.gms.google-services'` at the bottom).

## 5. Check the bridge before you build a release
Capacitor puts `window.Capacitor` into the remote site, and the website looks for `Capacitor.Plugins.FirebaseAuthentication` and `Capacitor.Plugins.Browser`.
1. Run a debug build on a phone, open `chrome://inspect` on the PC, inspect the app.
2. In the console run: `Capacitor.isNativePlatform()` (expect `true`) and `Object.keys(Capacitor.Plugins)` (expect `FirebaseAuthentication` and `Browser` in the list).
3. **If the plugins are missing from that list** (this can happen when the site is loaded from `server.url`): do not change the website. Instead, ship a tiny local page bundle in the app (`webDir`) that registers the plugins and then redirects to the live site, or tell the founder so we add a bridge file. Report which case you hit.

## 6. Phone UI checks
- Status bar must not cover the top bar. If bars overlap content on Android 15 (edge-to-edge), set `android: { adjustMarginsForEdgeToEdge: "auto" }` in `capacitor.config.ts` (Capacitor 7) or add the top inset in `styles.xml`.
- Hardware Back: go back in the web history; exit only on `/dashboard` (`@capacitor/app` `backButton` listener).
- Check at 360x740 and a large phone: top bar shows search, streak, bell, avatar only; bottom bar reads Home / Classes / Study / Community / More.

## 7. Build and test (PowerShell)
```
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```
Test, in this order, on a real phone:
1. Open the app: landing, then Log in.
2. **Continue with Google**: the Google account sheet appears, then you land on the dashboard. (Error 10 = wrong id or missing SHA-1; "disallowed_useragent" = the native plugin is not active.)
3. Close and reopen the app: still signed in.
4. Plans > Upgrade (use the Paystack **test** key): Paystack opens in the browser tab, pay with the test card, come back to the app: "Payment received" and the plan chip updates (give it up to a few seconds).
5. Sign out, then sign in with email and password.

## 8. Shipping the APK
`public/sunroot.apk` is about 10 MB and every new version stays in git history forever, which slows the repo. Prefer GitHub Releases (or Vercel Blob) for the APK and point the landing-page download button at that URL. For the Play Store, build a signed **AAB** (`.\gradlew.bat bundleRelease`).

## 9. Report back
Which package id you chose, whether the plugin check in step 5 passed, the result of tests 2 to 5, and anything that needed a founder decision.
