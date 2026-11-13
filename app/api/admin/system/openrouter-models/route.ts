import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { OR_CLASSES, OR_CLASS_INFO, OR_TTS, type OrClass } from "@/lib/ai/openrouter-models";
import { getOpenRouterAssignments, setCachedOpenRouterAssignments } from "@/lib/ai/openrouter-assign";

export const runtime = "nodejs";

/** The recommended models for each kind of work, and what the admin has changed. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const picks = await getOpenRouterAssignments(true);
    return NextResponse.json({
      ok: true,
      data: {
        classes: OR_CLASSES.map((c) => ({ id: c, label: OR_CLASS_INFO[c].label, why: OR_CLASS_INFO[c].why, recommended: OR_CLASS_INFO[c].chain, pick: picks[`class:${c}`] || "" })),
        voices: OR_TTS.models,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const body = z.object({
  /** a kind of work, and the model to put first (empty to go back to the recommendation) */
  class: z.enum(OR_CLASSES as unknown as [OrClass, ...OrClass[]]),
  model: z.string().trim().max(120).regex(/^([a-z0-9.-]+\/[A-Za-z0-9._:-]+)?$/, "A model id looks like vendor/model-name."),
});

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const b = await parseJson(req, body);
    const ref = adminDb().collection("systemConfig").doc("openrouterModels");
    const picks = { ...(await getOpenRouterAssignments(true)) };
    if (b.model) picks[`class:${b.class}`] = b.model;
    else delete picks[`class:${b.class}`];
    await ref.set({ ...picks, updatedBy: admin.email || admin.uid, updatedAt: Timestamp.now() });
    setCachedOpenRouterAssignments(picks);
    return NextResponse.json({ ok: true, data: { saved: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
