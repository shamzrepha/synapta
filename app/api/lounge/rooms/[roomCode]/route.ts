import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const caller = await requireUser(req);

    const roomRef = adminDb().collection("rooms").doc(roomCode);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: `Room ${roomCode} does not exist.` } },
        { status: 404 }
      );
    }

    const roomData = roomDoc.data()!;
    const memberIds: string[] = Array.isArray(roomData.memberIds) ? roomData.memberIds : [];
    const participants: { uid: string; displayName: string; role: string; joinedAt?: string }[] =
      Array.isArray(roomData.participants) ? roomData.participants : [];

    // Reading never joins: a non-member has to join by code with POST.
    if (!memberIds.includes(caller.uid) && caller.role !== "admin") {
      throw new ApiError(403, "NOT_MEMBER", "Join this room with its code first.");
    }

    // Fetch messages subcollection
    const messagesSnap = await roomRef
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limit(60)
      .get();

    const messages = messagesSnap.docs.map((d) => {
      const m = d.data();
      return {
        id: d.id,
        uid: m.uid,
        displayName: m.displayName || "Anonymous",
        text: m.text,
        createdAt: m.createdAt?.toDate ? m.createdAt.toDate().toISOString() : new Date().toISOString(),
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        roomCode,
        title: roomData.title,
        classId: roomData.classId,
        kcId: roomData.kcId,
        kcTitle: roomData.kcTitle,
        hostId: roomData.hostId,
        hostName: roomData.hostName,
        scratchpad: roomData.scratchpad || "",
        designId: roomData.designId || null,
        participants,
        messages,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Join a room by its code. The caller must be able to see the room's class. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const caller = await requireUser(req);
    const roomRef = adminDb().collection("rooms").doc(roomCode);
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) throw new ApiError(404, "NOT_FOUND", `Room ${roomCode} does not exist.`);
    const roomData = roomDoc.data()!;
    await assertClassAccess(caller, String(roomData.classId || ""), "view");

    const memberIds: string[] = Array.isArray(roomData.memberIds) ? roomData.memberIds : [];
    if (memberIds.includes(caller.uid)) return NextResponse.json({ ok: true, data: { roomCode, joined: false } });

    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    const displayName = userDoc.exists ? userDoc.data()?.displayName || "Student" : "Student";
    const participants = Array.isArray(roomData.participants) ? roomData.participants : [];
    await roomRef.update({
      memberIds: [...memberIds, caller.uid],
      participants: [...participants, { uid: caller.uid, displayName, role: "learner", joinedAt: new Date().toISOString() }],
      updatedAt: Timestamp.now(),
    });
    await roomRef.collection("messages").add({
      uid: "system",
      displayName: "Sunroot Lounge",
      text: `${displayName} joined the study session.`,
      createdAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, data: { roomCode, joined: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
