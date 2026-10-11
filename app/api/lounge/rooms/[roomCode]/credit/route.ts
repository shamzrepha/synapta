import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { applyEvidence } from "@/lib/evidence/apply";
import { ApiError, parseJson } from "@/lib/api/errors";
import { z } from "zod";

export const runtime = "nodejs";

const creditInputSchema = z.object({
  targetUid: z.string().min(1, "targetUid is required"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const caller = await requireUser(req);
    const { targetUid } = await parseJson(req, creditInputSchema);

    if (targetUid === caller.uid) {
      throw new ApiError(
        400,
        "SELF_CREDIT_FORBIDDEN",
        "You cannot credit yourself. Peer explanations must be awarded by another participant in the room."
      );
    }

    const roomRef = adminDb().collection("rooms").doc(roomCode);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", `Study room ${roomCode} does not exist`);
    }

    const roomData = roomDoc.data()!;
    const memberIds: string[] = Array.isArray(roomData.memberIds) ? roomData.memberIds : [];

    if (!memberIds.includes(caller.uid)) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You must be an active member of this study room to award peer explanation credit."
      );
    }

    if (!memberIds.includes(targetUid)) {
      throw new ApiError(
        400,
        "INVALID_TARGET",
        "The target user is not a participant in this study room."
      );
    }

    if (!roomData.classId || !roomData.kcId) {
      throw new ApiError(
        400,
        "MISSING_CONTEXT",
        "This study room is not linked to a specific classroom and knowledge component."
      );
    }

    // Check anti-farming: only 1 credit per caller-target pair per room session
    const creditDocRef = roomRef.collection("credits").doc(`${caller.uid}_${targetUid}`);
    const creditDoc = await creditDocRef.get();
    if (creditDoc.exists) {
      throw new ApiError(
        429,
        "ALREADY_CREDITED",
        "You have already credited this peer for an explanation in this study session.",
        { "Retry-After": "3600" }
      );
    }

    // Record credit in subcollection
    await creditDocRef.set({
      fromUid: caller.uid,
      targetUid,
      roomCode,
      classId: roomData.classId,
      kcId: roomData.kcId,
      createdAt: Timestamp.now(),
    });

    // Apply evidence to the target peer (+40 XP, Omega = 2.0)
    const evidenceResult = await applyEvidence({
      uid: targetUid,
      classId: roomData.classId,
      kcId: roomData.kcId,
      activity: "peer_explain",
      correct: true,
      metadata: {
        creditedBy: caller.uid,
        roomCode,
      },
    });

    // Post celebration system message to room chat
    await roomRef.collection("messages").add({
      uid: "system",
      displayName: "Synapta Lounge",
      text: `🎉 Peer Explanation Credited! +40 XP awarded to peer with Omega = 2.0 mastery acceleration.`,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: evidenceResult,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
