import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const postMessageSchema = z.object({
  text: z.string().min(1).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = postMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid message" } },
        { status: 400 }
      );
    }

    const { text } = parsed.data;

    const roomRef = adminDb().collection("rooms").doc(roomCode);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Room not found" } },
        { status: 404 }
      );
    }

    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    const displayName = userDoc.exists ? userDoc.data()?.displayName || "Student" : "Student";

    const msgRef = await roomRef.collection("messages").add({
      uid: caller.uid,
      displayName,
      text,
      createdAt: Timestamp.now(),
    });

    await roomRef.update({
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: msgRef.id,
        uid: caller.uid,
        displayName,
        text,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
