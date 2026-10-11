"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
} from "firebase/auth";
import { clientAuth, googleProvider } from "@/lib/firebase/client";
import { useUserStore, UserProfile } from "@/lib/store/use-user-store";
import { useRouter } from "next/navigation";

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    pass: string,
    name: string,
    requestTeacher: boolean,
    username?: string
  ) => Promise<void>;
  signInWithGoogle: (requestTeacher?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user: userProfile, setUser } = useUserStore();
  const router = useRouter();

  const establishSessionCookie = async (idToken: string) => {
    try {
      const sessionRes = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!sessionRes.ok) {
        const errJson = await sessionRes.json().catch(() => ({}));
        console.warn("Session cookie creation warning:", errJson?.error?.message);
      }
    } catch (err) {
      console.warn("Failed to set session cookie:", err);
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
          if (data.data.user.role === "admin") {
            await user.getIdToken(true).catch(() => {});
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
        try {
          if (user) {
            await bootstrapUser(user);
          } else {
            setUser(null);
          }
        } catch (err) {
          console.warn("Auth state change error:", err);
        } finally {
          setIsLoading(false);
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
  }, [setUser, bootstrapUser]);

  const signInWithEmail = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const auth = clientAuth();
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const idToken = await cred.user.getIdToken(true);
      await establishSessionCookie(idToken);
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
    try {
      const auth = clientAuth();
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }
      const idToken = await cred.user.getIdToken(true);
      await establishSessionCookie(idToken);
      await bootstrapUser(cred.user, requestTeacher ? "pending" : "none", username, name);
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async (requestTeacher = false) => {
    setIsLoading(true);
    try {
      const auth = clientAuth();
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken(true);
      await establishSessionCookie(idToken);
      await bootstrapUser(cred.user, requestTeacher ? "pending" : "none");
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      const auth = clientAuth();
      await fbSignOut(auth);
    } catch {
      // ignore
    }
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
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
