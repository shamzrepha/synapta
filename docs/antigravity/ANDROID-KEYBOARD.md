# Android app: the keyboard covers the screen while typing (for Antigravity, `sunroot-mobile` project)

The website already copes with the keyboard (`components/shell/keyboard-guard.tsx` hides the bottom menu, tutor button, bot and read-aloud bar while a text field is focused, and scrolls the field into view). It can only do that if the WebView actually shrinks or reports the keyboard. In the Capacitor shell it often does not, which looks like "the screen is blocked when I type".

## Check these in the native project (all paths are inside `sunroot-mobile`)

1. `android/app/src/main/AndroidManifest.xml`, on the `<activity>`: `android:windowSoftInputMode="adjustResize"`.
2. `capacitor.config.ts` (or `.json`): add the Keyboard plugin and let it resize the web view, also in full screen:
   ```ts
   plugins: { Keyboard: { resize: "native", resizeOnFullScreen: true } }
   ```
   then `npm i @capacitor/keyboard && npx cap sync android`.
3. If `targetSdkVersion` is 35 or higher, Android 15 forces edge-to-edge and **ignores adjustResize**, so the keyboard sits on top of the page. Either keep the Keyboard plugin above, or in `MainActivity` apply the keyboard height as bottom padding:
   ```java
   ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content), (v, insets) -> {
     Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
     Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
     v.setPadding(bars.left, bars.top, bars.right, Math.max(ime.bottom, bars.bottom));
     return WindowInsetsCompat.CONSUMED;
   });
   ```
4. Do not set the status bar to overlay the web view (`StatusBar.overlaysWebView` must be `false`) unless the site pads for it.

## Test (real phone)
Open the tutor, a quiz with a typed answer and the class search. In each: tap the field, the field must stay visible above the keyboard, the bottom menu and floating buttons must disappear, and closing the keyboard brings them back.

## Report back
Which of 1 to 3 was missing, the `targetSdkVersion`, and a short screen recording of the tutor chat with the keyboard open.
