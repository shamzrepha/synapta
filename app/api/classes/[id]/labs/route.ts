import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { labSchema } from "@/lib/studio/labs";

export const runtime = "nodejs";

/** Every build lab across the class's topics (for the Assignments page), with the caller's progress. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: classId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const db = adminDb();
    const [kcs, mine, all] = await Promise.all([
      db.collection("classes").doc(classId).collection("kcs").orderBy("order", "asc").get(),
      db.collection("designs").where("ownerUid", "==", caller.uid).where("classId", "==", classId).get(),
      access.canMutate ? db.collection("designs").where("classId", "==", classId).limit(1000).get() : Promise.resolve(null),
    ]);
    const myByLab = new Map(mine.docs.filter((d) => d.data().labId).map((d) => [String(d.data().labId), d.data()]));
    const startedByLab = new Map<string, number>();
    const finishedByLab = new Map<string, number>();
    for (const d of all?.docs || []) {
      const lab = d.data().labId as string | undefined;
      if (!lab) continue;
      startedByLab.set(lab, (startedByLab.get(lab) || 0) + 1);
      const steps = (d.data().spec?.steps || []).length;
      const done = Object.values(((d.data().progress || {})[d.data().ownerUid] || {}) as Record<string, { done?: boolean }>).filter((p) => p.done).length;
      if (steps > 0 && done >= steps) finishedByLab.set(lab, (finishedByLab.get(lab) || 0) + 1);
    }
    const labs = kcs.docs.flatMap((k) =>
      (Array.isArray(k.data().labs) ? k.data().labs : [])
        .map((l: unknown) => labSchema.safeParse(l))
        .filter((r: { success: boolean }) => r.success)
        .map((r: { data?: ReturnType<typeof labSchema.parse> }) => {
          const l = r.data!;
          const key = `${classId}/${k.id}/${l.id}`;
          const my = myByLab.get(key);
          const myDone = my ? Object.values(((my.progress || {})[caller.uid] || {}) as Record<string, { done?: boolean }>).filter((p) => p.done).length : 0;
          return { ...l, kcId: k.id, kcTitle: String(k.data().title || "Topic"), myDesignId: my?.id || null, myDone, started: startedByLab.get(key) || 0, finished: finishedByLab.get(key) || 0 };
        })
    );
    return NextResponse.json({ ok: true, data: { labs, canManage: access.canMutate } });
  } catch (error) {
    return handleAuthError(error);
  }
}
