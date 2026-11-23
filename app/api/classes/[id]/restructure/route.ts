import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { restructureKcs, type KcNode } from "@/lib/teacher/restructure";
import { writeAudit } from "@/lib/security/audit";

export const runtime = "nodejs";

const body = z.object({ apply: z.boolean().default(false) });

/**
 * Tidy a class's topic structure (order, prerequisites, weeks, parents). No AI is called and no lesson, note or student record is
 * read or changed, so it costs nothing. With `apply: false` it only reports what would change.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const access = await assertClassAccess(caller, id, "mutate");
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "class-restructure", limit: 20, windowMs: 60 * 60 * 1000, shared: true });
    if (limited) return limited;
    const { apply } = await parseJson(req, body);

    const col = adminDb().collection("classes").doc(id).collection("kcs");
    const snap = await col.get();
    const kcs: Array<KcNode & { title: string }> = snap.docs.map((d) => {
      const x = d.data();
      return { id: d.id, title: String(x.title || "Topic"), order: typeof x.order === "number" ? x.order : undefined, week: typeof x.week === "number" ? x.week : undefined, prerequisiteIds: Array.isArray(x.prerequisiteIds) ? x.prerequisiteIds.filter((p: unknown): p is string => typeof p === "string") : [], parentId: typeof x.parentId === "string" ? x.parentId : null };
    });
    const durationWeeks = typeof access.classData.durationWeeks === "number" ? access.classData.durationWeeks : undefined;
    const result = restructureKcs(kcs, { durationWeeks });
    const titles = new Map(kcs.map((k) => [k.id, k.title]));

    if (apply && result.changes.length > 0) {
      for (let i = 0; i < result.changes.length; i += 400) {
        const batch = adminDb().batch();
        for (const c of result.changes.slice(i, i + 400)) {
          const { id: kcId, ...fields } = c;
          batch.update(col.doc(kcId), { ...fields, updatedAt: Timestamp.now() });
        }
        await batch.commit();
      }
      await writeAudit({ actorUid: caller.uid, actorEmail: caller.email, action: "class.restructure", targetType: "class", targetId: id, details: result.summary });
    }

    return NextResponse.json({
      ok: true,
      data: { applied: apply && result.changes.length > 0, summary: result.summary, examples: result.changes.slice(0, 6).map((c) => ({ topic: titles.get(c.id) || c.id, ...c })) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
