"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/client";
import type { FeatureKey } from "@/lib/billing/plans";

export interface BillingMe {
  role: string;
  enforced: boolean;
  paid: boolean;
  resetAt: number;
  plan: { id: string; label: string; codename: string; limits: Record<FeatureKey, number | null> };
  usage: Record<FeatureKey, number>;
}

let cached: { at: number; value: BillingMe | null } | null = null;
let inflight: Promise<BillingMe | null> | null = null;
const TTL = 20_000;

async function load(): Promise<BillingMe | null> {
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  inflight ||= fetchJson<BillingMe>("/api/billing/me")
    .then((j) => {
      const value = j.ok ? j.data : null;
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The signed-in person's plan and this month's usage. Shared between the top bar, the notices and the usage lines, fetched once. */
export function useBilling(): BillingMe | null {
  const [me, setMe] = useState<BillingMe | null>(cached?.value ?? null);
  useEffect(() => {
    let live = true;
    load().then((v) => live && setMe(v));
    return () => {
      live = false;
    };
  }, []);
  return me;
}
