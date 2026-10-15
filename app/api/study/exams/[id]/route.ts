import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { isDayString, rescheduleMissed, type PlanDay } from "@/lib/exams/schedule";
import { assertPlausibleToday } from "@/lib/exams/server";
import { z } from "zod";

export const runtime = "nodejs";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle"), itemId: z.string().min(1).max(80), done: z.boolean() }),
  z.object({ action: z.literal("reschedule"), today: z.string().refine(isDayString, "today must be YYYY-MM-DD") }),
]);

async function loadOwn(id: string, uid: string) {
  const ref = adminDb().collection("examPlans").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.uid !== uid) throw new ApiError(404, "NOT_FOUND", "Exam plan not found");
  return { ref, data: snap.data()! };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const body = await parseJson(req, patchSchema);
    const { ref, data } = await loadOwn(id, caller.uid);
    const plan = (Array.isArray(data.plan) ? data.plan : []) as PlanDay[];
    const done = { ...((data.done || {}) as Record<string, boolean>) };
    const now = new Date().toISOString();

    if (body.action === "toggle") {
      if (!plan.some((d) => d.items.some((i) => i.id === body.itemId))) throw new ApiError(404, "NOT_FOUND", "Item not in this plan");
      if (body.done) done[body.itemId] = true;
      else delete done[body.itemId];
      await ref.update({ done, updatedAt: now });
      return NextResponse.json({ ok: true, data: { id, plan, done } });
    }

    assertPlausibleToday(body.today);
    const next = rescheduleMissed({ plan, done, today: body.today, minutesPerDay: data.minutesPerDay || 60 });
    await ref.update({ plan: next, updatedAt: now });
    return NextResponse.json({ ok: true, data: { id, plan: next, done } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const { ref } = await loadOwn(id, caller.uid);
    await ref.delete();
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
