import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { bumpChannels } from "@/lib/live/server";
import { serializePoll } from "@/lib/polls/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const ref = adminDb().collection("polls").doc(id);
    const [s, v] = await Promise.all([ref.get(), ref.collection("pollVotes").doc(caller.uid).get()]);
    if (!s.exists || s.data()!.deleted) throw new ApiError(404, "NOT_FOUND", "Poll not found");
    return NextResponse.json({ ok: true, data: { poll: serializePoll(id, s.data()!, caller.uid, v.exists ? (v.data()!.optionId as string) : null) } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const ref = adminDb().collection("polls").doc(id);
    const s = await ref.get();
    if (!s.exists) throw new ApiError(404, "NOT_FOUND", "Poll not found");
    if (s.data()!.authorUid !== caller.uid && caller.role !== "admin") throw new ApiError(403, "FORBIDDEN", "Only the author can delete this poll.");
    await ref.update({ deleted: true });
    await bumpChannels(["polls", `poll:${id}`]);
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
