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
    requestTeacher: boolean
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

  const syncBackendSession = useCallback(
    async (user: FirebaseUser, roleRequest: "none" | "pending" = "none") => {
      const idToken = await user.getIdToken();

      // 1. Set session cookie for middleware
      const sessionRes = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!sessionRes.ok) {
        const errJson = await sessionRes.json().catch(() => ({}));
        throw new Error(
          errJson?.error?.message || "Failed to initialize server session cookie."
        );
      }

      // 2. Bootstrap user profile
      const bootstrapRes = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          roleRequest,
          displayName: user.displayName || user.email?.split("@")[0] || "Learner",
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
        if (user) {
          await syncBackendSession(user);
        } else {
          setUser(null);
        }
        setIsLoading(false);
      });
    } catch (err) {
      console.warn("Client Firebase Auth initialization skipped in environment:", err);
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    return () => unsubscribe();
  }, [setUser, syncBackendSession]);

  const signInWithEmail = async (email: string, pass: string) => {
    setIsLoading(true);
    const auth = clientAuth();
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await syncBackendSession(cred.user);
    setIsLoading(false);
  };

  const signUpWithEmail = async (
    email: string,
    pass: string,
    name: string,
    requestTeacher: boolean
  ) => {
    setIsLoading(true);
    const auth = clientAuth();
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (name) {
      await updateProfile(cred.user, { displayName: name });
    }
    await syncBackendSession(cred.user, requestTeacher ? "pending" : "none");
    setIsLoading(false);
  };

  const signInWithGoogle = async (requestTeacher = false) => {
    setIsLoading(true);
    const auth = clientAuth();
    const cred = await signInWithPopup(auth, googleProvider);
    await syncBackendSession(cred.user, requestTeacher ? "pending" : "none");
    setIsLoading(false);
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
    await firebaseUser.getIdToken(true); // force refresh claims
    await syncBackendSession(firebaseUser);
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
