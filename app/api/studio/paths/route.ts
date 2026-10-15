import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { generatePath } from "@/lib/studio/paths";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("users").doc(caller.uid).collection("paths").orderBy("createdAt", "desc").limit(30).get();
    return NextResponse.json({
      ok: true,
      data: {
        paths: snap.docs.map((d) => {
          const p = d.data();
          const total = (p.stages || []).reduce((n: number, s: { checklist: string[] }) => n + s.checklist.length, 0);
          const done = Object.values((p.done || {}) as Record<string, boolean>).filter(Boolean).length;
          return { id: d.id, goal: p.goal, title: p.title, stages: (p.stages || []).length, done, total, createdAt: p.createdAt?.toDate?.().toISOString() || null };
        }),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  goal: z.string().trim().min(4).max(500),
  level: z.number().int().min(1).max(5).default(1),
  interests: z.array(z.string().max(40)).max(2).default([]),
  preference: z.string().max(80).default(""),
});

/** Turns a goal into a saved learning path. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_ai", limit: 8, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const path = await generatePath({ goal: body.goal, level: body.level ?? 1, interests: body.interests ?? [], preference: body.preference ?? "", userId: caller.uid });
    const ref = adminDb().collection("users").doc(caller.uid).collection("paths").doc();
    await ref.set({ ...path, goal: body.goal, level: body.level ?? 1, interests: body.interests ?? [], done: {}, designs: {}, createdAt: Timestamp.now() });
    // Remember the learner's level/interests for future paths and recommendations
    await adminDb().collection("users").doc(caller.uid).set({ makerProfile: { level: body.level ?? 1, interests: body.interests ?? [], preference: body.preference ?? "" } }, { merge: true });
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
