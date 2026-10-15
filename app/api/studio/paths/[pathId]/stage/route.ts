import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { createDesign } from "@/lib/studio/store";
import { getTemplate, templateStart } from "@/lib/studio/templates";
import { generateDesign } from "@/lib/studio/design-ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Opens (creating on first use) the Maker Studio design that practises a stage of the path. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ pathId: string }> }) {
  try {
    const { pathId } = await params;
    const caller = await requireUser(req);
    const { stageId } = await parseJson(req, z.object({ stageId: z.string().regex(/^st\d{1,2}$/) }));
    const ref = adminDb().collection("users").doc(caller.uid).collection("paths").doc(pathId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Path not found");
    const p = snap.data()!;
    const existing = (p.designs || {})[stageId];
    if (existing) {
      const d = await adminDb().collection("designs").doc(existing).get();
      if (d.exists) return NextResponse.json({ ok: true, data: { designId: existing } });
    }
    const stage = (p.stages || []).find((s: { id: string }) => s.id === stageId);
    if (!stage) throw new ApiError(404, "NOT_FOUND", "Stage not found");
    let designId: string;
    const t = stage.templateId ? getTemplate(stage.templateId) : undefined;
    if (t) {
      designId = await createDesign({ user: caller, title: `${stage.title}`.slice(0, 80), spec: templateStart(t, true), source: "template", message: `Path “${p.title}” — ${stage.title}`, templateId: t.id });
    } else {
      const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_ai", limit: 8, windowMs: 60_000 });
      if (limited) return limited;
      const out = await generateDesign({ prompt: `${stage.buildPrompt || stage.title}. Context: this practises "${stage.title}" on the way to the goal "${p.goal}".`, level: p.level >= 4 ? "advanced" : p.level >= 2 ? "intermediate" : "beginner", userId: caller.uid });
      designId = await createDesign({ user: caller, title: out.title, spec: out.spec, source: "ai", message: `Path “${p.title}” — ${stage.title}` });
    }
    await ref.update({ [`designs.${stageId}`]: designId });
    return NextResponse.json({ ok: true, data: { designId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
