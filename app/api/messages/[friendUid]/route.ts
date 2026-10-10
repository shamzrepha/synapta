import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const postMessageSchema = z.object({
  text: z.string().min(1).max(2000),
});

function getChatId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ friendUid: string }> }
) {
  try {
    const caller = await requireUser(req);
    const { friendUid } = await params;

    const chatId = getChatId(caller.uid, friendUid);

    const messagesSnap = await adminDb()
      .collection("direct_chats")
      .doc(chatId)
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limit(100)
      .get();

    const messages = messagesSnap.docs.map((d) => ({
      id: d.id,
      senderUid: d.data().senderUid,
      senderName: d.data().senderName,
      text: d.data().text,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      data: { messages },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ friendUid: string }> }
) {
  try {
    const caller = await requireUser(req);
    const { friendUid } = await params;

    const body = await req.json();
    const parsed = postMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Message text cannot be empty" } },
        { status: 400 }
      );
    }

    const { text } = parsed.data;
    const chatId = getChatId(caller.uid, friendUid);

    // Get caller displayName
    const callerDoc = await adminDb().collection("users").doc(caller.uid).get();
    const senderName = callerDoc.data()?.displayName || "Learner";

    const chatDocRef = adminDb().collection("direct_chats").doc(chatId);
    const messageRef = chatDocRef.collection("messages").doc();

    const now = Timestamp.now();
    const newMessage = {
      id: messageRef.id,
      senderUid: caller.uid,
      senderName,
      text,
      createdAt: now,
      read: false,
    };

    const batch = adminDb().batch();

    // 1. Add message
    batch.set(messageRef, newMessage);

    // 2. Update chat metadata
    batch.set(
      chatDocRef,
      {
        chatId,
        participants: [caller.uid, friendUid],
        lastMessage: text,
        lastMessageAt: now,
        lastSenderUid: caller.uid,
        updatedAt: now,
      },
      { merge: true }
    );

    await batch.commit();

    return NextResponse.json({
      ok: true,
      data: {
        message: {
          ...newMessage,
          createdAt: now.toDate().toISOString(),
        },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
