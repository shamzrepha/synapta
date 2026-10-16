import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { getActiveStudentUids } from "@/lib/classes/members";
import { notifyMany } from "@/lib/notifications/server";
import { PUBLISH_KEYS } from "@/lib/classes/published";
import { liveStatus, pushToStudents, takeOffline } from "@/lib/classes/live";
import { snapshotLabDesign } from "@/lib/studio/labs";
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
    let pushed = 0;
    for (const d of kcs.docs) {
      if (published) {
        const status = await liveStatus(id, d.id, d.data());
        const keys = status.filter((s) => s.hasDraft && (s.mode !== "snapshot" || s.changed)).map((s) => s.key);
        if (keys.length) {
          await pushToStudents(id, d.id, keys).catch(() => null);
          pushed += keys.length;
        }
      } else {
        await takeOffline(id, d.id, [...PUBLISH_KEYS]);
      }
      if (Array.isArray(d.data().labs) && d.data().labs.length) {
        const labs = [];
        for (const l of d.data().labs as Array<Record<string, unknown>>) {
          const live = published ? await snapshotLabDesign(caller, id, d.id, l as never) : {};
          labs.push({ ...l, ...live, published });
        }
        await d.ref.update({ labs, updatedAt: Timestamp.now() });
      }
    }
    if (published && pushed) {
      const uids = await getActiveStudentUids(id).catch(() => [] as string[]);
      await notifyMany(uids, { type: "system", title: `New material in “${String(access.classData.title || "your class")}”`, body: "Your teacher published new lessons and practice.", href: `/classes/${id}`, icon: "📣" }).catch(() => null);
    }
    return NextResponse.json({ ok: true, data: { topics: kcs.size, pushed, published } });
  } catch (error) {
    return handleAuthError(error);
  }
}
