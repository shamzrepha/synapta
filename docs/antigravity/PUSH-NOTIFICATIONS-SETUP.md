# Push notifications: what has to be true in Firebase

The app side is done (the notification helper registers and starts). If turning notifications on shows
"Google refused the push registration", the fix is in the Firebase / Google Cloud project, not in the code.

Everything below uses ONE Firebase project and ONE Web app. Mixing values from two projects is the most common cause.

## 1. Settings (Vercel > Project > Settings > Environment Variables, Production and Preview)
Copy all of these from Firebase console > Project settings > General > Your apps > the **Web** app:

| Variable | Looks like |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSy...` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `your-project` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `123456789012` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:123456789012:web:abc123` (the number must equal the sender id) |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | about 87 characters, starts with `B` |

The VAPID key is in Project settings > **Cloud Messaging** > **Web configuration** > Web Push certificates > "Key pair".
Paste only the key: no spaces and no quote marks. After changing any `NEXT_PUBLIC_` value, **redeploy**: they are baked in at build time.

The app now checks these itself and says which one looks wrong when you press the notifications toggle.

## 2. APIs enabled (Google Cloud console > the same project > APIs & Services > Library)
- Firebase Cloud Messaging API
- **Firebase Cloud Messaging Registration API** (`fcmregistrations.googleapis.com`)
- **Firebase Installations API**

## 3. The browser API key (APIs & Services > Credentials > the key named in `NEXT_PUBLIC_FIREBASE_API_KEY`)
- API restrictions: either "Don't restrict key", or the list must include the two APIs above.
- Website restrictions: must include `sunrootlearn.vercel.app` (and `*.vercel.app` if you test previews).

## 4. Test
Open the site in a fresh tab, toggle notifications on, allow the browser prompt. If it still fails, open DevTools > Console
and send the line starting `[push] couldn't enable:`. Do not send keys.
