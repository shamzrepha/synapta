"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Capacitor } from "@capacitor/core";

/**
 * On native mobile (Capacitor), users opening the app should NEVER be stranded
 * on the marketing landing page. Automatically forwards to /dashboard if signed in,
 * or /login if not yet signed in.
 */
export function MobileLandingRedirect() {
  const router = useRouter();
  const { firebaseUser, isLoading } = useAuth();

  useEffect(() => {
    const isNative =
      typeof window !== "undefined" &&
      (Capacitor.isNativePlatform() ||
        (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

    if (isNative) {
      if (!isLoading) {
        if (firebaseUser) {
          router.replace("/dashboard");
        } else {
          router.replace("/login");
        }
      }
    }
  }, [isLoading, firebaseUser, router]);

  return null;
}
