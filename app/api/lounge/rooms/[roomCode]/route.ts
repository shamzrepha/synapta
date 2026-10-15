import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";

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
    let memberIds: string[] = Array.isArray(roomData.memberIds) ? roomData.memberIds : [];
    let participants: { uid: string; displayName: string; role: string; joinedAt?: string }[] =
      Array.isArray(roomData.participants) ? roomData.participants : [];

    // Auto-join room if caller is not yet recorded as a member
    if (!memberIds.includes(caller.uid)) {
      const userDoc = await adminDb().collection("users").doc(caller.uid).get();
      const displayName = userDoc.exists ? userDoc.data()?.displayName || "Student" : "Student";

      memberIds = [...memberIds, caller.uid];
      participants = [
        ...participants,
        {
          uid: caller.uid,
          displayName,
          role: "learner",
          joinedAt: new Date().toISOString(),
        },
      ];

      await roomRef.update({
        memberIds,
        participants,
        updatedAt: Timestamp.now(),
      });

      // Post join notification message
      await roomRef.collection("messages").add({
        uid: "system",
        displayName: "Sunroot Lounge",
        text: `${displayName} joined the study session.`,
        createdAt: Timestamp.now(),
      });
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
        participants,
        messages,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
