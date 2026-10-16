import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { getActiveStudentUids } from "@/lib/classes/members";
import { notifyMany } from "@/lib/notifications/server";
import { PUBLISH_KEYS, PUBLISH_LABEL, publishMapOf } from "@/lib/classes/published";
import { bumpChannel } from "@/lib/live/server";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  /** which pieces to change; "all" = everything on the topic, labs included */
  keys: z.union([z.literal("all"), z.array(z.enum([...PUBLISH_KEYS, "labs"] as [string, ...string[]])).min(1)]),
  published: z.boolean(),
});

/** Teachers decide what students see: publish (or pull back) the lecture note, podcast, simulation, practice and labs of a topic. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, classId, "mutate");
    const body = await parseJson(req, schema);
    const ref = adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found");
    const data = snap.data()!;
    const keys = body.keys === "all" ? [...PUBLISH_KEYS, "labs"] : body.keys;
    const before = publishMapOf(data);
    const next = { ...before };
    for (const k of keys) if ((PUBLISH_KEYS as readonly string[]).includes(k)) next[k as (typeof PUBLISH_KEYS)[number]] = body.published;
    const update: Record<string, unknown> = { contentPublished: next, updatedAt: Timestamp.now() };
    let newlyLive = PUBLISH_KEYS.filter((k) => next[k] && !before[k]).map((k) => PUBLISH_LABEL[k]);
    if (keys.includes("labs") && Array.isArray(data.labs)) {
      const labs = data.labs as Array<{ published?: boolean; title?: string }>;
      if (body.published && labs.some((l) => l.published === false)) newlyLive = [...newlyLive, "Build lab"];
      update.labs = labs.map((l) => ({ ...l, published: body.published }));
    }
    await ref.update(update);
    if (body.published && newlyLive.length) {
      const uids = await getActiveStudentUids(classId).catch(() => [] as string[]);
      await notifyMany(uids, { type: "system", title: `New in “${String(data.title || "your class")}”`, body: `${newlyLive.join(", ")} ${newlyLive.length > 1 ? "are" : "is"} ready`, href: `/classes/${classId}/topics/${kcId}`, icon: "📣" }).catch(() => null);
    }
    await bumpChannel(`kc:${classId}:${kcId}`);
    return NextResponse.json({ ok: true, data: { published: next } });
  } catch (error) {
    return handleAuthError(error);
  }
}
