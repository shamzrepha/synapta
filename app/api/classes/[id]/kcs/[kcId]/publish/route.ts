import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { getActiveStudentUids } from "@/lib/classes/members";
import { notifyMany } from "@/lib/notifications/server";
import { PUBLISH_KEYS, PUBLISH_LABEL, type PublishKey } from "@/lib/classes/published";
import { liveStatus, pushToStudents, takeOffline } from "@/lib/classes/live";
import { bumpChannel } from "@/lib/live/server";
import { snapshotLabDesign } from "@/lib/studio/labs";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

function kcRef(classId: string, kcId: string) {
  return adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);
}

/** What students have vs. the teacher's working copy, for each piece of the topic. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, classId, "mutate");
    const snap = await kcRef(classId, kcId).get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found");
    const status = await liveStatus(classId, kcId, snap.data()!);
    return NextResponse.json({ ok: true, data: { status } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  /** which pieces to change; "all" = everything on the topic, labs included */
  keys: z.union([z.literal("all"), z.array(z.enum([...PUBLISH_KEYS, "labs"] as [string, ...string[]])).min(1)]),
  /** true = push the working copy to students (a new snapshot); false = take it offline */
  published: z.boolean(),
});

/**
 * Teachers control what students see, like pushing a commit: students read the last pushed snapshot, so
 * anything the teacher creates or changes stays private until they push it. Pushing again publishes updates.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, classId, "mutate");
    const body = await parseJson(req, schema);
    const ref = kcRef(classId, kcId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found");
    const data = snap.data()!;
    const wanted = body.keys === "all" ? [...PUBLISH_KEYS, "labs"] : body.keys;
    let keys = wanted.filter((k): k is PublishKey => (PUBLISH_KEYS as readonly string[]).includes(k));
    const wantsLabs = wanted.includes("labs");

    // "Push everything" pushes what exists and skips what hasn't been created
    if (body.keys === "all" && body.published) {
      const status = await liveStatus(classId, kcId, data);
      keys = keys.filter((k) => status.find((s) => s.key === k)?.hasDraft);
    }

    const newlyLive: string[] = [];
    if (body.published) {
      const before = await liveStatus(classId, kcId, data);
      if (keys.length) await pushToStudents(classId, kcId, keys);
      for (const k of keys) {
        const b = before.find((s) => s.key === k);
        newlyLive.push(b?.mode === "off" ? PUBLISH_LABEL[k] : `${PUBLISH_LABEL[k]} (updated)`);
      }
    } else if (keys.length) {
      await takeOffline(classId, kcId, keys);
    }

    if (wantsLabs && Array.isArray(data.labs)) {
      const labs = data.labs as Array<{ id: string; published?: boolean; designId?: string | null }>;
      const next = [];
      for (const l of labs) {
        const live = body.published ? await snapshotLabDesign(caller, classId, kcId, l as never) : (l as Record<string, unknown>);
        next.push({ ...l, ...(live as object), published: body.published });
      }
      if (body.published && labs.some((l) => l.published === false)) newlyLive.push("Build lab");
      await ref.update({ labs: next, updatedAt: Timestamp.now() });
    }

    if (body.published && newlyLive.length) {
      const uids = await getActiveStudentUids(classId).catch(() => [] as string[]);
      await notifyMany(uids, { type: "system", title: `New in “${String(data.title || "your class")}”`, body: `${newlyLive.join(", ")}`, href: `/classes/${classId}/topics/${kcId}`, icon: "📣" }).catch(() => null);
    }
    await bumpChannel(`kc:${classId}:${kcId}`);
    const fresh = await ref.get();
    return NextResponse.json({ ok: true, data: { status: await liveStatus(classId, kcId, fresh.data()!), labs: fresh.data()!.labs || [] } });
  } catch (error) {
    return handleAuthError(error);
  }
}
