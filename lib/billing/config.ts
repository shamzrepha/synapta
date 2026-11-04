import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { billingEnforced as envEnforced } from "./plans";

/**
 * The on/off switch for plan limits, kept in the database so an admin can flip it from the admin screen without a redeploy.
 *   off      nobody is limited; usage is still counted
 *   testers  only the listed test accounts are limited (and can pay and see the upgrade pop-up); everyone else is untouched
 *   all      everybody is limited
 * Until an admin has saved a choice, the BILLING_ENFORCED=1 environment variable decides (all or off).
 */
export type EnforceMode = "off" | "testers" | "all";

export interface BillingConfig {
  mode: EnforceMode;
  /** user ids of the test accounts */
  testers: string[];
}

export function resolveEnforced(cfg: BillingConfig | null, uid: string | null, envOn: boolean): boolean {
  if (!cfg) return envOn;
  if (cfg.mode === "all") return true;
  if (cfg.mode === "testers") return !!uid && cfg.testers.includes(uid);
  return false;
}

export function parseConfig(raw: unknown): BillingConfig | null {
  const d = raw as { mode?: unknown; testers?: unknown } | null | undefined;
  if (!d || (d.mode !== "off" && d.mode !== "testers" && d.mode !== "all")) return null;
  const testers = Array.isArray(d.testers) ? d.testers.filter((t): t is string => typeof t === "string" && t.length > 0).slice(0, 50) : [];
  return { mode: d.mode, testers };
}

const TTL_MS = 10_000;
let cache: { cfg: BillingConfig | null; at: number } | null = null;

export function clearConfigCache() {
  cache = null;
}

/** The saved switch (or null when an admin has never set it). A read error is not cached, so it falls back to the environment setting. */
export async function getBillingConfig(): Promise<BillingConfig | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  try {
    const snap = await adminDb().collection("config").doc("billing").get();
    const cfg = snap.exists ? parseConfig(snap.data()) : null;
    cache = { cfg, at: Date.now() };
    return cfg;
  } catch {
    return null;
  }
}

/** Whether plan limits apply to this person right now. */
export async function isEnforced(uid: string | null): Promise<boolean> {
  return resolveEnforced(await getBillingConfig(), uid, envEnforced());
}

export async function saveBillingConfig(cfg: BillingConfig, adminUid: string): Promise<void> {
  await adminDb().collection("config").doc("billing").set({ mode: cfg.mode, testers: cfg.testers.slice(0, 50), updatedBy: adminUid, updatedAt: Timestamp.now() });
  clearConfigCache();
}
