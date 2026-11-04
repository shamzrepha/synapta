"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

/**
 * Ensures a user is signed in to access protected /app routes.
 * If not authenticated, smoothly bounces them to /login with redirect.
 */
export function AuthGuard() {
  const { firebaseUser, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !firebaseUser) {
      const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/dashboard";
      router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
    }
  }, [isLoading, firebaseUser, router]);

  return null;
}
