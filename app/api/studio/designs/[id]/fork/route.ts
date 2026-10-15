import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { FieldValue } from "@/lib/firebase/admin";
import { bumpChannel } from "@/lib/live/server";
import { createDesign, loadDesign } from "@/lib/studio/store";
import { parseSpec } from "@/lib/studio/spec";
import { notify } from "@/lib/notifications/server";

export const runtime = "nodejs";

/** Make your own copy (credit kept in `forkedFrom`). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref, data } = await loadDesign(id, caller);
    const newId = await createDesign({
      user: caller,
      title: `${data.title} (remix)`.slice(0, 80),
      spec: parseSpec(data.spec),
      source: "fork",
      message: `Forked from “${data.title}” by ${data.ownerName}`,
      classId: data.visibility === "class" ? data.classId : null,
      visibility: data.visibility === "class" ? "class" : "private",
      templateId: data.templateId || null,
      forkedFrom: { id, title: data.title, ownerName: data.ownerName, commitId: data.headCommitId },
    });
    await ref.update({ forkCount: FieldValue.increment(1) });
    await bumpChannel(`design:${id}`);
    if (data.ownerUid !== caller.uid) {
      await notify(data.ownerUid, { type: "like", title: "Someone remixed your design", body: `“${data.title}” was forked`, href: `/studio/${newId}`, icon: "🔀", actorUid: caller.uid }).catch(() => null);
    }
    return NextResponse.json({ ok: true, data: { id: newId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
