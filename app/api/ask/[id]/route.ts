import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { bumpChannels } from "@/lib/live/server";
import { serializeQuestion, serializeReplies } from "@/lib/ask/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const isAdmin = caller.role === "admin";
    const ref = adminDb().collection("askQuestions").doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()!.deleted) throw new ApiError(404, "NOT_FOUND", "Question not found");
    const up = await ref.collection("upvotes").doc(caller.uid).get();
    return NextResponse.json({
      ok: true,
      data: {
        question: serializeQuestion(id, snap.data()!, caller.uid, isAdmin, up.exists),
        replies: await serializeReplies(id, caller.uid, isAdmin),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** The asker (checked server-side) or an admin can remove a question. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const ref = adminDb().collection("askQuestions").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Question not found");
    if (snap.data()!.authorUid !== caller.uid && caller.role !== "admin") throw new ApiError(403, "FORBIDDEN", "Only the asker can delete this.");
    await ref.update({ deleted: true });
    await bumpChannels(["ask", `ask:${id}`]);
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
