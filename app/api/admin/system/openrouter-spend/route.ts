import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { getDailyCap, setCachedDailyCap } from "@/lib/ai/openrouter-spend";
import { writeAudit } from "@/lib/security/audit";

export const runtime = "nodejs";

const top = (m: unknown, n = 6): Array<{ name: string; usd: number }> =>
  Object.entries((m && typeof m === "object" ? m : {}) as Record<string, unknown>)
    .map(([name, v]) => ({ name, usd: Number(v) || 0 }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, n);

/** What OpenRouter has cost: the last 7 days, today's biggest models and tasks, and the daily limit. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
    const snaps = await Promise.all(days.map((d) => adminDb().collection("aiSpend").doc(d).get()));
    const rows = snaps.map((s, i) => ({ day: days[i], usd: Number(s.exists ? s.data()?.total : 0) || 0, calls: Number(s.exists ? s.data()?.calls : 0) || 0 }));
    const today = snaps[0].exists ? snaps[0].data() || {} : {};
    return NextResponse.json({
      ok: true,
      data: { cap: await getDailyCap(true), days: rows, topModels: top(today.byModel), topTasks: top(today.byTask) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const body = z.object({ dailyCapUsd: z.number().min(0).max(1000) });

/** Sets the daily limit in dollars (0 switches OpenRouter off until it is raised). */
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const b = await parseJson(req, body);
    await adminDb().collection("systemConfig").doc("orBudget").set({ dailyCapUsd: b.dailyCapUsd, updatedBy: admin.email || admin.uid, updatedAt: Timestamp.now() });
    setCachedDailyCap(b.dailyCapUsd);
    await writeAudit({ actorUid: admin.uid, actorEmail: admin.email, action: "ai_spend.cap_changed", targetType: "config", targetId: "orBudget", details: { dailyCapUsd: b.dailyCapUsd } });
    return NextResponse.json({ ok: true, data: { cap: b.dailyCapUsd } });
  } catch (error) {
    return handleAuthError(error);
  }
}
