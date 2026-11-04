import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { Auth, GoogleAuthProvider, UserCredential, signInWithCredential, signInWithPopup } from "firebase/auth";

let inited = false;
const WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || "39168865444-78540pim00l8mdj250rl1s9d78b89j9p.apps.googleusercontent.com";

/**
 * Handles seamless Google Sign-In.
 * On Native Android: triggers the native Android Credential Manager account sheet
 * showing ALL Google accounts present on the device, extracting ID token, and authenticating.
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

      console.log("[NativeAuth] Launching SocialLogin.login for Google...");
      const res = await SocialLogin.login({
        provider: "google",
        options: {
          scopes: ["email", "profile"],
          autoSelectEnabled: false,
          filterByAuthorizedAccounts: false,
        } as unknown as Record<string, unknown>,
      });

      console.log("[NativeAuth] Received SocialLogin result:", JSON.stringify(res));

      // Extract the verified Google ID token from Credential Manager result
      const resultObj = res.result as Record<string, unknown> | undefined;
      const idToken =
        (resultObj?.idToken as string | undefined) ||
        ((resultObj?.response as Record<string, unknown> | undefined)?.idToken as string | undefined) ||
        ((resultObj?.authentication as Record<string, unknown> | undefined)?.idToken as string | undefined) ||
        (resultObj?.accessToken as string | undefined);

      if (idToken) {
        console.log("[NativeAuth] Acquired idToken, exchanging with Firebase...");
        const credential = GoogleAuthProvider.credential(idToken);
        const userCred = await signInWithCredential(auth, credential);
        console.log("[NativeAuth] Firebase authenticated successfully for:", userCred.user?.email);
        return userCred;
      } else {
        console.warn("[NativeAuth] No idToken found in result object:", res);
        throw new Error("No Google ID token received from device account picker.");
      }
    } catch (err: unknown) {
      console.warn("[NativeAuth] Native Google login error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("cancel") || msg.includes("16") || msg.includes("popup-closed") || msg.includes("USER_CANCELLED")) {
        throw new Error("auth/popup-closed-by-user");
      }
      // If native bridge failed unexpectedly, fall back to browser popup
      console.log("[NativeAuth] Falling back to standard browser sign-in...");
      return await signInWithPopup(auth, fallbackProvider);
    }
  }

  // Fallback for regular web browsers
  return await signInWithPopup(auth, fallbackProvider);
}
