import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { getActiveStudentUids } from "@/lib/classes/members";
import { notifyMany } from "@/lib/notifications/server";
import { z } from "zod";

export const runtime = "nodejs";

/** Publish (or pull back) every topic's content in one go: the "go live" button for a class. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const access = await assertClassAccess(caller, id, "mutate");
    const { published } = await parseJson(req, z.object({ published: z.boolean() }));
    const kcs = await adminDb().collection("classes").doc(id).collection("kcs").get();
    const batch = adminDb().batch();
    for (const d of kcs.docs) {
      const labs = Array.isArray(d.data().labs) ? (d.data().labs as Array<Record<string, unknown>>).map((l) => ({ ...l, published })) : undefined;
      batch.update(d.ref, { contentPublished: { lesson: published, audio: published, simulation: published, practice: published }, ...(labs ? { labs } : {}), updatedAt: Timestamp.now() });
    }
    await batch.commit();
    if (published && kcs.size) {
      const uids = await getActiveStudentUids(id).catch(() => [] as string[]);
      await notifyMany(uids, { type: "system", title: `New material in “${String(access.classData.title || "your class")}”`, body: "Your teacher published new lessons and practice.", href: `/classes/${id}`, icon: "📣" }).catch(() => null);
    }
    return NextResponse.json({ ok: true, data: { topics: kcs.size, published } });
  } catch (error) {
    return handleAuthError(error);
  }
}
