"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/api/client";
import type { FeatureKey } from "@/lib/billing/plans";

interface Me {
  enforced: boolean;
  plan: { id: string; label: string; limits: Record<FeatureKey, number | null> };
  usage: Record<FeatureKey, number>;
}

/** A one-line reminder of what is left this month for the given features. Only shown once limits are switched on. */
export function UsageStrip({ features }: { features: Array<{ key: FeatureKey; label: string }> }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let live = true;
    fetchJson<Me>("/api/billing/me").then((j) => live && j.ok && setMe(j.data));
    return () => {
      live = false;
    };
  }, []);
  if (!me || !me.enforced) return null;
  const parts = features.filter((f) => me.plan.limits[f.key] !== null).map((f) => `${Math.max(0, (me.plan.limits[f.key] as number) - me.usage[f.key])} ${f.label} left`);
  if (parts.length === 0) return null;
  return (
    <p className="text-xs text-slate-500">
      {me.plan.label} plan this month: {parts.join(" · ")}.{" "}
      {me.plan.id === "free" && <Link href="/plans" className="font-semibold text-teal-700 dark:text-teal-300 underline">Upgrade</Link>}
    </p>
  );
}
