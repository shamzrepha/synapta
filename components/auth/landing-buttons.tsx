"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

/** The landing page's top-right buttons: "Open Sunroot" for someone who is already signed in, "Log in" and "Start free" for everyone else. */
export function LandingButtons() {
  const { firebaseUser, isLoading } = useAuth();
  if (!isLoading && firebaseUser) {
    return (
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-full bg-[#F28C28] px-4 py-2 text-sm font-bold text-[#12241C] hover:bg-[#F59E45]">
        Open Sunroot <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <>
      <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-[#FBF6EC] hover:bg-white/10">Log in</Link>
      <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-full bg-[#F28C28] px-4 py-2 text-sm font-bold text-[#12241C] hover:bg-[#F59E45]">
        Start free <ArrowRight className="h-4 w-4" />
      </Link>
    </>
  );
}
