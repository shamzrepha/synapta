import { adminDb, Timestamp } from "@/lib/firebase/admin";

/**
 * Site-wide switches an admin can flip from /admin/controls without a redeploy.
 *   aiPaused  stops every AI feature for students and teachers (the cost kill switch); admin health checks still run
 *   notice    a short message shown at the top of the app for everyone (maintenance, an outage, good news)
 */
export type NoticeLevel = "info" | "warning";

export interface SiteConfig {
  aiPaused: boolean;
  /** shown to people when they try an AI feature while it is paused */
  aiPausedMessage: string;
  notice: { text: string; level: NoticeLevel } | null;
}

export const DEFAULT_PAUSE_MESSAGE = "AI features are paused for a short while. Everything else still works. Please try again soon.";
export const DEFAULT_SITE: SiteConfig = { aiPaused: false, aiPausedMessage: DEFAULT_PAUSE_MESSAGE, notice: null };
const MAX_NOTICE = 240;

/** Reads whatever is stored and returns a safe config: anything odd falls back to "everything on, no notice". */
export function parseSite(raw: unknown): SiteConfig {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = typeof d.noticeText === "string" ? d.noticeText.trim().slice(0, MAX_NOTICE) : "";
  const msg = typeof d.aiPausedMessage === "string" ? d.aiPausedMessage.trim().slice(0, MAX_NOTICE) : "";
  return {
    aiPaused: d.aiPaused === true,
    aiPausedMessage: msg || DEFAULT_PAUSE_MESSAGE,
    notice: text ? { text, level: d.noticeLevel === "warning" ? "warning" : "info" } : null,
  };
}

const TTL_MS = 10_000;
let cache: { cfg: SiteConfig; at: number } | null = null;
export function clearSiteCache() {
  cache = null;
}

/** The saved switches. A read error means "everything on" (so a database blip can never lock people out), and is not cached. */
export async function getSiteConfig(): Promise<SiteConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  try {
    const snap = await adminDb().collection("config").doc("site").get();
    const cfg = snap.exists ? parseSite(snap.data()) : DEFAULT_SITE;
    cache = { cfg, at: Date.now() };
    return cfg;
  } catch {
    return DEFAULT_SITE;
  }
}

export async function saveSiteConfig(cfg: SiteConfig, adminUid: string): Promise<void> {
  const clean = parseSite({ aiPaused: cfg.aiPaused, aiPausedMessage: cfg.aiPausedMessage, noticeText: cfg.notice?.text, noticeLevel: cfg.notice?.level });
  const db = adminDb();
  const batch = db.batch();
  batch.set(db.collection("config").doc("site"), {
    aiPaused: clean.aiPaused,
    aiPausedMessage: clean.aiPausedMessage,
    noticeText: clean.notice?.text ?? "",
    noticeLevel: clean.notice?.level ?? "info",
    updatedBy: adminUid,
    updatedAt: Timestamp.now(),
  });
  batch.set(db.collection("auditLogs").doc(), {
    actorUid: adminUid,
    action: "site.config_updated",
    targetType: "config",
    targetId: "site",
    details: { aiPaused: clean.aiPaused, notice: clean.notice?.text ?? null },
    createdAt: Timestamp.now(),
  });
  await batch.commit();
  clearSiteCache();
}
