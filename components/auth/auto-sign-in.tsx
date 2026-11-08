"use client";

import React, { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { safeRedirect } from "@/lib/auth/redirect";

/**
 * Put on the login and sign-up pages. The browser keeps people signed in for a long time, but the server's session cookie
 * is shorter, so someone who comes back can land on the login form while Sunroot already knows them. As soon as the saved
 * sign-in is confirmed, this takes them to where they were going (or their dashboard), with no typing.
 */
export function AutoSignIn() {
  const { firebaseUser, userProfile, isLoading } = useAuth();
  const ready = !isLoading && !!firebaseUser && !!userProfile;

  useEffect(() => {
    if (!ready) return;
    window.location.replace(safeRedirect(new URLSearchParams(window.location.search).get("redirect")));
  }, [ready]);

  // while the saved sign-in is being checked, or just after it is found, say so instead of showing a form to fill in
  if (!ready && !(isLoading && typeof window !== "undefined" && firebaseUser)) return null;
  return (
    <p role="status" className="mb-3 rounded-xl bg-brand-500/10 px-3 py-2 text-center text-xs font-semibold text-brand-800 dark:text-brand-200 animate-pulse">
      Welcome back. Signing you in…
    </p>
  );
}
