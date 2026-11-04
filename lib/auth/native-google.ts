import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { Auth, GoogleAuthProvider, UserCredential, signInWithCredential, signInWithPopup } from "firebase/auth";

let inited = false;
const WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || "39168865444-78540pim00l8mdj250rl1s9d78b89j9p.apps.googleusercontent.com";

/**
 * Handles seamless Google Sign-In.
 * On Native Android/iOS: triggers the Android Credential Manager account sheet directly,
 * letting the user tap their existing phone Google account without typing email/password.
 * In a normal browser: uses standard Firebase popup.
 */
export async function nativeGoogleSignIn(auth: Auth, fallbackProvider: GoogleAuthProvider): Promise<UserCredential> {
  const isNative = typeof window !== "undefined" && (Capacitor.isNativePlatform() || (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

  if (isNative) {
    try {
      if (!inited) {
        await SocialLogin.initialize({
          google: {
            webClientId: WEB_CLIENT_ID,
          },
        });
        inited = true;
      }

      const res = await SocialLogin.login({
        provider: "google",
        options: {
          scopes: ["email", "profile"],
        },
      });

      // Extract the verified Google ID token from Credential Manager
      const idToken = (res.result as { idToken?: string })?.idToken || (res.result as unknown as { response?: { idToken?: string } })?.response?.idToken;
      if (idToken) {
        const credential = GoogleAuthProvider.credential(idToken);
        return await signInWithCredential(auth, credential);
      }
    } catch (err: unknown) {
      console.warn("Native Google login fell back to web flow:", err);
      // If user dismissed the native account picker, re-throw clean error
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("cancel") || msg.includes("16") || msg.includes("popup-closed")) {
        throw new Error("auth/popup-closed-by-user");
      }
    }
  }

  // Fallback for regular web browsers
  return await signInWithPopup(auth, fallbackProvider);
}
