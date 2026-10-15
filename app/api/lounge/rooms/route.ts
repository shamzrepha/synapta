import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const createRoomSchema = z.object({
  title: z.string().min(1).max(80),
  classId: z.string().min(1),
  kcId: z.string().optional(),
  kcTitle: z.string().optional(),
  invitedUids: z.array(z.string()).optional(),
});

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SYN-${code}`;
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);

    // Fetch recent rooms
    const roomsSnap = await adminDb()
      .collection("rooms")
      .orderBy("updatedAt", "desc")
      .limit(20)
      .get();

    const rooms = roomsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        roomCode: doc.id,
        title: data.title || "Study Session",
        classId: data.classId,
        kcId: data.kcId || null,
        kcTitle: data.kcTitle || null,
        hostId: data.hostId,
        hostName: data.hostName || "Student",
        participantCount: Array.isArray(data.participants) ? data.participants.length : 1,
        isMember: Array.isArray(data.memberIds) ? data.memberIds.includes(caller.uid) : false,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
      };
    });

    return NextResponse.json({ ok: true, data: rooms });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = createRoomSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { title, classId, kcId, kcTitle, invitedUids = [] } = parsed.data;

    // Fetch user name
    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    const displayName = userDoc.exists ? userDoc.data()?.displayName || "Student" : "Student";

    // Generate room code and check uniqueness
    let roomCode = generateRoomCode();
    let existing = await adminDb().collection("rooms").doc(roomCode).get();
    let attempts = 0;
    while (existing.exists && attempts < 5) {
      roomCode = generateRoomCode();
      existing = await adminDb().collection("rooms").doc(roomCode).get();
      attempts++;
    }

    const memberIds = Array.from(new Set([caller.uid, ...invitedUids]));
    const initialParticipants = [
      {
        uid: caller.uid,
        displayName,
        role: "host",
        joinedAt: new Date().toISOString(),
      },
    ];

    const initialScratchpad = `# ${title}\n\n**Topic:** ${kcTitle || "Collaborative Review"}\n**Host:** ${displayName}\n\n### Problem Formulation & Equations\nUse this shared scratchpad to work through derivations, circuit schematics, and concepts together.\n\n$$I = \\frac{V}{R}$$\n\n$$\\text{Sum} = A \\oplus B, \\quad \\text{Carry} = A \\cdot B$$`;

    const roomData = {
      title,
      classId,
      kcId: kcId || null,
      kcTitle: kcTitle || null,
      hostId: caller.uid,
      hostName: displayName,
      memberIds,
      participants: initialParticipants,
      scratchpad: initialScratchpad,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await adminDb().collection("rooms").doc(roomCode).set(roomData);

    // Post system welcome message in messages subcollection
    await adminDb()
      .collection("rooms")
      .doc(roomCode)
      .collection("messages")
      .add({
        uid: "system",
        displayName: "Sunroot Lounge Bot",
        text: `Welcome to Study Room ${roomCode}! Collaborate in the scratchpad, explain concepts to each other, and record peer evidence.`,
        createdAt: Timestamp.now(),
      });

    return NextResponse.json({
      ok: true,
      data: {
        roomCode,
        room: roomData,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
