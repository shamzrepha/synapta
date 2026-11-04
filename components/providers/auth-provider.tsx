"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signInWithCustomToken,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut as fbSignOut,
  updateProfile,
  sendEmailVerification,
} from "firebase/auth";
import { clientAuth, googleProvider } from "@/lib/firebase/client";
import { useUserStore, UserProfile } from "@/lib/store/use-user-store";
import { useRouter } from "next/navigation";
import { isAndroidWebView, isNativeApp, nativePlugin } from "@/lib/native/bridge";
import { adoptAccountPrefs } from "@/components/settings/use-prefs";

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  /** `remember` (default true) is the "Keep me signed in" box: false signs you out when the browser is closed */
  signInWithEmail: (email: string, pass: string, remember?: boolean) => Promise<void>;
  signUpWithEmail: (
    email: string,
    pass: string,
    name: string,
    requestTeacher: boolean,
    username?: string
  ) => Promise<void>;
  signInWithGoogle: (requestTeacher?: boolean, remember?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const REMEMBER_KEY = "sunroot:remember";
/** The "Keep me signed in" choice made at the last sign-in (on unless the person turned it off). */
function readRemember(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}
function saveRemember(remember: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch {}
}
async function applyPersistence(remember: boolean) {
  try {
    await setPersistence(clientAuth(), remember ? browserLocalPersistence : browserSessionPersistence);
  } catch {
    // some browsers refuse (private mode); sign-in still works for this visit
  }
  saveRemember(remember);
}

/**
 * Google refuses to sign anyone in inside an app's embedded web view, so the Android app signs in with Google natively
 * (the "FirebaseAuthentication" plugin) and hands the result to Firebase here. In a normal browser it is the usual popup.
 */
async function googleSignInUser(auth: ReturnType<typeof clientAuth>): Promise<FirebaseUser> {
  const native = isNativeApp() ? nativePlugin<{ signInWithGoogle: (o?: { skipNativeAuth?: boolean }) => Promise<{ credential?: { idToken?: string } }> }>("FirebaseAuthentication") : null;
  if (native) {
    let idToken: string | undefined;
    try {
      idToken = (await native.signInWithGoogle({ skipNativeAuth: true })).credential?.idToken;
    } catch (e) {
      // closing the Google sheet is not an error worth showing
      if (/cancel/i.test(e instanceof Error ? e.message : String(e))) throw Object.assign(new Error("popup-closed-by-user"), { code: "auth/popup-closed-by-user" });
      throw e;
    }
    if (!idToken) throw new Error("Google didn't finish signing you in. Please try again.");
    return (await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))).user;
  }
  if (isAndroidWebView()) {
    throw new Error("Google sign-in isn't set up in this version of the app yet. Please sign in with your email and password, or update the app.");
  }
  return (await signInWithPopup(auth, googleProvider)).user;
}

/** Asks the server to turn a still-valid session cookie into a sign-in. "none": the server has no valid session; "unavailable": it couldn't say. */
async function restoreFromCookie(auth: ReturnType<typeof clientAuth>): Promise<"restored" | "none" | "unavailable"> {
  try {
    const res = await fetch("/api/auth/restore", { method: "POST" });
    if (res.status === 401) return "none";
    if (!res.ok) return "unavailable";
    const j = await res.json().catch(() => null);
    if (!j?.ok || !j.data?.token) return "unavailable";
    await signInWithCustomToken(auth, j.data.token);
    return "restored";
  } catch {
    return "unavailable";
  }
}

/** The server said its cookie is no good (or there is no one signed in): clear it, so the login page isn't bounced to the dashboard by it. */
async function dropStaleCookie() {
  const cleared = await fetch("/api/auth/session", { method: "DELETE" }).then((r) => r.ok, () => false);
  const here = window.location.pathname;
  // on a protected page the server now sees no cookie and sends them to sign in
  if (cleared && here !== "/" && !/^\/(login|signup)(\/|$)/.test(here)) window.location.assign(`/login?redirect=${encodeURIComponent(here + window.location.search)}`);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user: userProfile, setUser } = useUserStore();
  const router = useRouter();

  // set while signing out, so the saved-session restore below doesn't sign the person straight back in
  const signingOut = useRef(false);
  const restoreTried = useRef(false);

  const establishSessionCookie = async (idToken: string, remember: boolean = readRemember()): Promise<boolean> => {
    try {
      const sessionRes = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, remember }),
      });
      if (!sessionRes.ok) {
        const errJson = await sessionRes.json().catch(() => ({}));
        console.warn("Session cookie creation warning:", errJson?.error?.message);
      }
      return sessionRes.ok;
    } catch (err) {
      console.warn("Failed to set session cookie:", err);
      return false;
    }
  };

  const bootstrapUser = useCallback(
    async (
      user: FirebaseUser,
      roleRequest: "none" | "pending" = "none",
      customUsername?: string,
      customDisplayName?: string
    ) => {
      try {
        const idToken = await user.getIdToken();
        const effectiveName = customDisplayName || user.displayName || user.email?.split("@")[0] || "Learner";
        const bootstrapRes = await fetch("/api/auth/bootstrap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            roleRequest,
            displayName: effectiveName,
            username: customUsername || undefined,
            photoURL: user.photoURL || null,
          }),
        });

        const data = await bootstrapRes.json().catch(() => ({}));
        if (data.ok && data.data?.user) {
          setUser(data.data.user);
          try {
            const tokenResult = await user.getIdTokenResult();
            if (tokenResult.claims.role !== data.data.user.role) {
              const freshToken = await user.getIdToken(true);
              await establishSessionCookie(freshToken);
            }
          } catch {
            // ignore token check error
          }
        } else if (!bootstrapRes.ok && data.error?.message) {
          console.warn("Bootstrap notice:", data.error.message);
          throw new Error(data.error.message);
        }
      } catch (err) {
        console.error("Bootstrap error:", err);
        throw err;
      }
    },
    [setUser]
  );

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      const auth = clientAuth();
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        setFirebaseUser(user);
        let restored = false;
        try {
          if (user) {
            // The browser stays signed in far longer than the 5-day server cookie lives, so every time the app opens
            // we renew the cookie from the live sign-in. Otherwise pages and API calls fail with "no user".
            try {
              await establishSessionCookie(await user.getIdToken());
            } catch {
              // the bootstrap below still works from the token itself
            }
            try {
              await bootstrapUser(user);
            } catch {
              // one quiet retry: a network blip on refresh must not look like being signed out
              await new Promise((r) => setTimeout(r, 1200));
              await bootstrapUser(user);
            }
            // the language and other settings follow the account to every device
            adoptAccountPrefs(user.uid).catch(() => null);
          } else {
            setUser(null);
            // The browser has no saved sign-in. If the server still knows the person (a valid session cookie), sign them back
            // in from it instead of asking for a password: storage can vanish in private mode, in-app browsers and some
            // phones even though the cookie is fine. Tried once per page load, and never while signing out.
            if (!signingOut.current && !restoreTried.current) {
              restoreTried.current = true;
              const outcome = await restoreFromCookie(auth);
              if (outcome === "restored") {
                restored = true; // signing in fires this listener again with the person; keep the loading state until then
                return;
              }
              // only when the server itself says the session is no good; if it merely couldn't answer, the cookie stays
              if (outcome === "none") await dropStaleCookie();
            }
          }
        } catch (err) {
          console.warn("Auth state change error:", err);
        } finally {
          if (!restored) setIsLoading(false);
        }
      });
    } catch (err) {
      console.warn("Client Firebase Auth initialization skipped in environment:", err);
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    return () => unsubscribe();
  }, [setUser, bootstrapUser, router]);

  const signInWithEmail = async (email: string, pass: string, remember = true) => {
    setIsLoading(true);
    signingOut.current = false;
    try {
      const auth = clientAuth();
      await applyPersistence(remember);
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const idToken = await cred.user.getIdToken(true);
      await establishSessionCookie(idToken, remember);
      await bootstrapUser(cred.user);
    } finally {
      setIsLoading(false);
    }
  };

  const signUpWithEmail = async (
    email: string,
    pass: string,
    name: string,
    requestTeacher: boolean,
    username?: string
  ) => {
    setIsLoading(true);
    signingOut.current = false;
    try {
      const auth = clientAuth();
      await applyPersistence(true);
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }
      // confirm the address; posting publicly waits for it (the banner lets them resend)
      sendEmailVerification(cred.user).catch(() => {});
      const idToken = await cred.user.getIdToken(true);
      await establishSessionCookie(idToken);
      await bootstrapUser(cred.user, requestTeacher ? "pending" : "none", username, name);
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async (requestTeacher = false, remember = true) => {
    setIsLoading(true);
    signingOut.current = false;
    try {
      const auth = clientAuth();
      await applyPersistence(remember);
      const user = await googleSignInUser(auth);
      const idToken = await user.getIdToken(true);
      await establishSessionCookie(idToken, remember);
      await bootstrapUser(user, requestTeacher ? "pending" : "none");
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    // end the server session first and block the restore, or the saved cookie would sign the person straight back in
    signingOut.current = true;
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    try {
      const auth = clientAuth();
      await fbSignOut(auth);
    } catch {
      // ignore
    }
    setUser(null);
    setFirebaseUser(null);
    setIsLoading(false);
    router.push("/login");
  };

  const refreshUser = async () => {
    if (!firebaseUser) return;
    try {
      const refreshedToken = await firebaseUser.getIdToken(true); // force refresh claims
      await establishSessionCookie(refreshedToken);
      await bootstrapUser(firebaseUser);
    } catch (err) {
      console.warn("Refresh user error:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        isLoading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
