import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);

    // 1. Fetch friends subcollection
    const friendsSnap = await adminDb()
      .collection("users")
      .doc(caller.uid)
      .collection("friends")
      .orderBy("since", "desc")
      .get();

    const friends = friendsSnap.docs.map((d) => ({
      uid: d.id,
      displayName: d.data().displayName || "Friend",
      username: d.data().username || "",
      photoURL: d.data().photoURL || null,
      email: d.data().email || null,
      since: d.data().since?.toDate?.()?.toISOString() || null,
    }));

    // 2. Fetch pending incoming friend requests
    const incomingSnap = await adminDb()
      .collection("friend_requests")
      .where("toUid", "==", caller.uid)
      .where("status", "==", "pending")
      .get();

    const incomingRequests = incomingSnap.docs.map((d) => ({
      id: d.id,
      fromUid: d.data().fromUid,
      fromName: d.data().fromName,
      fromUsername: d.data().fromUsername,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    // 3. Fetch pending outgoing friend requests
    const outgoingSnap = await adminDb()
      .collection("friend_requests")
      .where("fromUid", "==", caller.uid)
      .where("status", "==", "pending")
      .get();

    const outgoingRequests = outgoingSnap.docs.map((d) => ({
      id: d.id,
      toUid: d.data().toUid,
      toName: d.data().toName,
      toUsername: d.data().toUsername,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        friends,
        incomingRequests,
        outgoingRequests,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
