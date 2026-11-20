import { adminDb, Timestamp } from "@/lib/firebase/admin";

export interface AuditEntry {
  actorUid: string;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  /** Small facts only (last4, counts, flags). Never a secret, a full key or message bodies. */
  details?: Record<string, unknown>;
}

const SECRETISH = /key|secret|token|password/i;

/** Drops anything that looks like a secret from audit details, keeping only short safe values. */
export function safeDetails(details: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (SECRETISH.test(k) && !/^last4$/i.test(k) && typeof v === "string" && v.length > 4) continue;
    out[k] = typeof v === "string" ? v.slice(0, 200) : v;
  }
  return out;
}

/** Appends one entry to auditLogs. Never throws: an audit write failure must not undo the admin's action. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await adminDb().collection("auditLogs").add({
      actorUid: entry.actorUid,
      actorName: entry.actorEmail ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      details: safeDetails(entry.details),
      createdAt: Timestamp.now(),
    });
  } catch (e) {
    console.error("audit write failed", entry.action, e instanceof Error ? e.message : "");
  }
}
