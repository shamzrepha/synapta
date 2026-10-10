import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();

    if (!query || query.length < 2) {
      return NextResponse.json({ ok: true, data: { users: [] } });
    }

    // Clean query (remove @ if typed)
    const cleanQuery = query.startsWith("@") ? query.slice(1) : query;

    // Fetch existing friends
    const friendsSnap = await adminDb()
      .collection("users")
      .doc(caller.uid)
      .collection("friends")
      .get();
    const friendUids = new Set(friendsSnap.docs.map((d) => d.id));

    // Fetch pending requests
    const outgoingReqsSnap = await adminDb()
      .collection("friend_requests")
      .where("fromUid", "==", caller.uid)
      .where("status", "==", "pending")
      .get();
    const sentUids = new Set(outgoingReqsSnap.docs.map((d) => d.data().toUid));

    const incomingReqsSnap = await adminDb()
      .collection("friend_requests")
      .where("toUid", "==", caller.uid)
      .where("status", "==", "pending")
      .get();
    const receivedMap = new Map<string, string>();
    incomingReqsSnap.docs.forEach((d) => {
      receivedMap.set(d.data().fromUid, d.id);
    });

    // Query users collection
    const usersSnap = await adminDb()
      .collection("users")
      .limit(60)
      .get();

    const matchedUsers: Array<{
      uid: string;
      displayName: string;
      username: string;
      email: string;
      photoURL: string | null;
      role: string;
      friendshipStatus: "friends" | "request_sent" | "request_received" | "none";
      requestId?: string;
    }> = [];

    usersSnap.forEach((doc) => {
      if (doc.id === caller.uid) return;
      const data = doc.data();
      const uName = (data.username || "").toLowerCase();
      const dName = (data.displayName || "").toLowerCase();
      const uEmail = (data.email || "").toLowerCase();

      const matches =
        uName.includes(cleanQuery) ||
        dName.includes(cleanQuery) ||
        uEmail.includes(cleanQuery);

      if (matches) {
        let friendshipStatus: "friends" | "request_sent" | "request_received" | "none" = "none";
        let requestId: string | undefined = undefined;

        if (friendUids.has(doc.id)) {
          friendshipStatus = "friends";
        } else if (sentUids.has(doc.id)) {
          friendshipStatus = "request_sent";
        } else if (receivedMap.has(doc.id)) {
          friendshipStatus = "request_received";
          requestId = receivedMap.get(doc.id);
        }

        matchedUsers.push({
          uid: doc.id,
          displayName: data.displayName || "Learner",
          username: data.username || data.displayName?.toLowerCase().replace(/\s+/g, "_") || doc.id.slice(0, 8),
          email: data.email || "",
          photoURL: data.photoURL || null,
          role: data.role || "student",
          friendshipStatus,
          requestId,
        });
      }
    });

    return NextResponse.json({
      ok: true,
      data: { users: matchedUsers.slice(0, 20) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
