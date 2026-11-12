import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { getActiveStudentUids } from "@/lib/classes/members";
import { notifyMany } from "@/lib/notifications/server";
import { pushClassContent } from "@/lib/classes/publish-all";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Push (or take offline) everything that exists across every topic of the class in one go. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const access = await assertClassAccess(caller, id, "mutate");
    const { published } = await parseJson(req, z.object({ published: z.boolean() }));
    const kcs = await adminDb().collection("classes").doc(id).collection("kcs").get();
    const result = await pushClassContent(caller, id, kcs.docs, published);
    if (published && result.pushed) {
      const uids = await getActiveStudentUids(id).catch(() => [] as string[]);
      await notifyMany(uids, { type: "system", title: `New material in “${String(access.classData.title || "your class")}”`, body: "Your teacher published new lessons and practice.", href: `/classes/${id}`, icon: "📣" }).catch(() => null);
    }
    return NextResponse.json({ ok: true, data: { topics: kcs.size, published, ...result } });
  } catch (error) {
    return handleAuthError(error);
  }
}
