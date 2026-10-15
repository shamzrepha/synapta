import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannel } from "@/lib/live/server";
import { getActiveStudentUids } from "@/lib/classes/members";
import { notifyMany } from "@/lib/notifications/server";
import { kcRef, newLabId, nowIso, readLabs, type Lab } from "@/lib/studio/labs";
import { createDesign } from "@/lib/studio/store";
import { getTemplate, templateStart } from "@/lib/studio/templates";
import { generateDesign } from "@/lib/studio/design-ai";
import { parseSpec } from "@/lib/studio/spec";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Labs for a topic, with the caller's progress; teachers also get every student's progress. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const labs = await readLabs(classId, kcId);
    const db = adminDb();
    const mine = await db.collection("designs").where("ownerUid", "==", caller.uid).where("kcId", "==", kcId).get();
    const myByLab = new Map(mine.docs.filter((d) => d.data().labId).map((d) => [String(d.data().labId), d]));
    let roster: Record<string, Array<{ uid: string; name: string; designId: string; done: number }>> | null = null;
    if (access.canMutate) {
      roster = {};
      const all = await db.collection("designs").where("classId", "==", classId).where("kcId", "==", kcId).limit(500).get();
      for (const d of all.docs) {
        const lab = String(d.data().labId || "").split("/")[2];
        if (!lab) continue;
        const prog = (d.data().progress || {})[d.data().ownerUid] || {};
        (roster[lab] ||= []).push({ uid: d.data().ownerUid, name: d.data().ownerName, designId: d.id, done: Object.values(prog).filter((p) => (p as { done?: boolean }).done).length });
      }
    }
    return NextResponse.json({
      ok: true,
      data: {
        canManage: access.canMutate,
        labs: labs.map((l) => {
          const d = myByLab.get(`${classId}/${kcId}/${l.id}`);
          const prog = d ? (d.data().progress || {})[caller.uid] || {} : {};
          return { ...l, myDesignId: d?.id || null, myDone: Object.values(prog).filter((p) => (p as { done?: boolean }).done).length, roster: roster?.[l.id] || null };
        }),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), title: z.string().trim().min(2).max(100), goal: z.string().trim().max(500).default(""), templateId: z.string().max(60).optional(), designId: z.string().max(80).optional(), dueAt: z.string().datetime().nullish() }),
  z.object({ action: z.literal("generate"), focus: z.string().trim().max(500).default(""), level: z.string().max(20).default("beginner") }),
  z.object({ action: z.literal("remove"), labId: z.string() }),
]);

/** Teachers add labs (from a template, one of their designs, or AI-generated for the topic) or remove them. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    await assertClassAccess(caller, classId, "mutate");
    const body = await parseJson(req, schema);
    const ref = kcRef(classId, kcId);
    const kc = await ref.get();
    if (!kc.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found");
    const labs = await readLabs(classId, kcId);
    let lab: Lab | null = null;

    if (body.action === "remove") {
      await ref.update({ labs: labs.filter((l) => l.id !== body.labId) });
    } else if (body.action === "add") {
      if (labs.length >= 12) throw new ApiError(409, "LIMIT", "Up to 12 labs per topic.");
      if (body.designId) {
        const d = await adminDb().collection("designs").doc(body.designId).get();
        if (!d.exists || d.data()!.ownerUid !== caller.uid) throw new ApiError(403, "FORBIDDEN", "Pick one of your own designs.");
        // Students need to read it to start their copy
        await d.ref.update({ classId, kcId, visibility: d.data()!.visibility === "public" ? "public" : "class" });
        const spec = parseSpec(d.data()!.spec);
        lab = { id: newLabId(), title: body.title, goal: body.goal ?? "", templateId: null, designId: body.designId, kind: spec.kind, stepCount: spec.steps.length, dueAt: body.dueAt || null, createdAt: nowIso() };
      } else {
        const t = getTemplate(body.templateId || "");
        if (!t) throw new ApiError(400, "VALIDATION", "Pick a template or one of your designs.");
        lab = { id: newLabId(), title: body.title, goal: body.goal ?? "", templateId: t.id, designId: null, kind: t.kind, stepCount: templateStart(t).steps.length, dueAt: body.dueAt || null, createdAt: nowIso() };
      }
      await ref.update({ labs: [...labs, lab] });
    } else {
      if (labs.length >= 12) throw new ApiError(409, "LIMIT", "Up to 12 labs per topic.");
      const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_ai", limit: 8, windowMs: 60_000 });
      if (limited) return limited;
      const k = kc.data()!;
      const out = await generateDesign({
        prompt: `A hands-on lab for the class topic "${k.title}". ${body.focus || ""}\nLesson summary: ${String(k.lessonMarkdown || k.description || "").slice(0, 2500)}\nBreak it into small guided steps that each teach one idea of this topic.`,
        level: body.level,
        userId: caller.uid,
      });
      const designId = await createDesign({ user: caller, title: out.title, spec: out.spec, source: "ai", message: `AI lab for “${k.title}”`, visibility: "class", classId, kcId });
      lab = { id: newLabId(), title: out.title, goal: out.spec.summary.slice(0, 500), templateId: null, designId, kind: out.spec.kind, stepCount: out.spec.steps.length, dueAt: null, createdAt: nowIso() };
      await ref.update({ labs: [...labs, lab] });
    }

    if (lab) {
      const uids = await getActiveStudentUids(classId).catch(() => [] as string[]);
      await notifyMany(uids, { type: "system", title: `New build lab: ${lab.title}`, body: `In “${kc.data()!.title}” — build and test it in Maker Studio`, href: `/classes/${classId}/topics/${kcId}?tab=build`, icon: "🛠️" }).catch(() => null);
    }
    await bumpChannel(`kc:${classId}:${kcId}`);
    return NextResponse.json({ ok: true, data: { lab } });
  } catch (error) {
    return handleAuthError(error);
  }
}
