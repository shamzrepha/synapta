import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
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
    await requireUser(req);
    const body = await req.json();
    const parsed = scratchpadUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid scratchpad text" } },
        { status: 400 }
      );
    }

    const { scratchpad } = parsed.data;

    const roomRef = adminDb().collection("rooms").doc(roomCode);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Room not found" } },
        { status: 404 }
      );
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
