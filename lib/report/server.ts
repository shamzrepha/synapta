import { randomBytes } from "crypto";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { generateWithFallback } from "@/lib/ai/router";
import { dayIdFor } from "@/lib/game/quests";
import { readActivityDays } from "@/lib/activity/server";
import { addDays } from "@/lib/streak/logic";
import { computeReport, fallbackNarrative, usesOnlyKnownNumbers, type EvidenceRow, type ReportNarrative, type ReportNumbers } from "./compute";
import { NarrativeSchema, REPORT_SYSTEM, reportPrompt } from "./prompts";

function ts(v: unknown): Date | null {
  return (v as { toDate?: () => Date } | undefined)?.toDate?.() ?? null;
}

/** Gathers what the app already stores; every query is defensive (failures count as zero). */
export async function buildReportNumbers(uid: string): Promise<ReportNumbers> {
  const today = dayIdFor();
  const from = addDays(today, -6);
  const db = adminDb();

  const [userSnap, activity, evSnap, postSnap] = await Promise.all([
    db.collection("users").doc(uid).get().catch(() => null),
    readActivityDays(uid, 14).catch(() => ({ counts: {}, xp: {} })),
    db.collection("evidence").where("uid", "==", uid).limit(1500).get().catch(() => null),
    db.collection("posts").where("authorUid", "==", uid).limit(200).get().catch(() => null),
  ]);

  const evidence: EvidenceRow[] = [];
  for (const d of evSnap?.docs || []) {
    const x = d.data();
    const date = ts(x.createdAt)?.toISOString().slice(0, 10);
    if (!date || date < from || date > today) continue;
    evidence.push({
      date,
      activity: String(x.activity || ""),
      correct: !!x.correct,
      kcId: String(x.kcId || ""),
      pLBefore: Number(x.pLBefore) || 0,
      pLAfter: Number(x.pLAfter) || 0,
      xpEarned: Number(x.xpEarned) || 0,
    });
  }

  let posts = 0;
  for (const d of postSnap?.docs || []) {
    const x = d.data();
    const date = ts(x.createdAt)?.toISOString().slice(0, 10);
    if (date && date >= from && date <= today && !x.deleted) posts++;
  }

  return computeReport({
    today,
    evidence,
    activityCounts: activity.counts,
    activityXp: activity.xp,
    posts,
    streakDays: userSnap?.data()?.streakDays || 0,
  });
}

/** AI-written narrative from the computed numbers only; falls back to a template if the output cites unknown numbers. */
export async function writeNarrative(uid: string, n: ReportNumbers): Promise<ReportNarrative & { aiGenerated: boolean }> {
  try {
    const out = await generateWithFallback({
      task: "structured_spec",
      systemInstruction: REPORT_SYSTEM,
      userPrompt: reportPrompt(n),
      schema: NarrativeSchema,
      temperature: 0.5,
      userId: uid,
    });
    const d = out.data;
    if (d) {
      const summary = d.summary.trim().slice(0, 500);
      const suggestion = d.suggestion.trim().slice(0, 240);
      if (usesOnlyKnownNumbers(`${summary} ${suggestion}`, n)) return { summary, suggestion, aiGenerated: true };
    }
  } catch {
    /* fall through to template */
  }
  return { ...fallbackNarrative(n), aiGenerated: false };
}

export function reportDoc(uid: string, to: string) {
  return adminDb().collection("users").doc(uid).collection("weeklyReports").doc(to);
}

export async function getStoredNarrative(uid: string, to: string): Promise<(ReportNarrative & { aiGenerated: boolean }) | null> {
  const snap = await reportDoc(uid, to).get().catch(() => null);
  const d = snap?.exists ? snap.data()! : null;
  if (!d?.summary) return null;
  return { summary: String(d.summary), suggestion: String(d.suggestion || ""), aiGenerated: !!d.aiGenerated };
}

export async function saveNarrative(uid: string, to: string, n: ReportNarrative & { aiGenerated: boolean }) {
  await reportDoc(uid, to).set({ ...n, createdAt: Timestamp.now() }, { merge: true });
}

export function firstNameOf(displayName: unknown): string {
  const first = String(displayName || "").trim().split(/\s+/)[0] || "";
  return first.replace(/[<>]/g, "").slice(0, 30) || "A learner";
}

export function newShareToken(): string {
  return randomBytes(16).toString("hex");
}

export const TOKEN_RE = /^[a-f0-9]{32}$/;
