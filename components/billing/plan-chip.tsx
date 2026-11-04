"use client";

import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useBilling } from "./use-billing";
import { FEATURES, FEATURE_LABEL } from "@/lib/billing/plans";

/** Shows which plan you're on in the top bar, and what's left. Only appears when plan limits apply to you. */
export function PlanChip() {
  const me = useBilling();
  // admins are never limited by a plan, so there is nothing to show them
  if (!me || !me.enforced || me.role === "admin") return null;
  const left = FEATURES.filter((f) => me.plan.limits[f] !== null && (me.plan.limits[f] as number) > 0).map((f) => `${Math.max(0, (me.plan.limits[f] as number) - me.usage[f])} ${FEATURE_LABEL[f].many} left`);
  return (
    <Link
      href="/plans"
      title={`${me.plan.label} plan${left.length ? `: ${left.join(", ")}` : ""}`}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${me.paid ? "border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-300" : "border-[#F28C28]/50 bg-[#F28C28]/15 text-[#9a4f00] dark:text-[#F5A55A]"}`}
    >
      <Sparkles className="h-3.5 w-3.5" />
      <span>{me.plan.label}</span>
      {!me.paid && <span className="hidden sm:inline underline">Upgrade</span>}
    </Link>
  );
}
