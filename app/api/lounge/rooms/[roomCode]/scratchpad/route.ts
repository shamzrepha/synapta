import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { z } from "zod";

export const runtime = "nodejs";

const scratchpadUpdateSchema = z.object({
  scratchpad: z.string().max(20000),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const caller = await requireUser(req);
    const { scratchpad } = await parseJson(req, scratchpadUpdateSchema);

    const roomRef = adminDb().collection("rooms").doc(roomCode);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Room not found");
    }

    const roomData = roomDoc.data()!;
    const memberIds: string[] = Array.isArray(roomData.memberIds) ? roomData.memberIds : [];

    if (!memberIds.includes(caller.uid) && caller.role !== "admin") {
      throw new ApiError(403, "FORBIDDEN", "You must join this study room before updating the scratchpad.");
    }

    await roomRef.update({
      scratchpad,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true, data: { scratchpad } });
  } catch (error) {
    return handleAuthError(error);
  }
}
