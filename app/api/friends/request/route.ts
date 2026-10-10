import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const sendRequestSchema = z.object({
  targetUid: z.string().min(1),
});

const handleRequestSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(["accept", "decline"]),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = sendRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "targetUid is required" } },
        { status: 400 }
      );
    }

    const { targetUid } = parsed.data;

    if (targetUid === caller.uid) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "You cannot add yourself as a friend." } },
        { status: 400 }
      );
    }

    // Verify target user exists
    const targetDoc = await adminDb().collection("users").doc(targetUid).get();
    if (!targetDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Target user not found" } },
        { status: 404 }
      );
    }

    // Verify not already friends
    const existingFriendDoc = await adminDb()
      .collection("users")
      .doc(caller.uid)
      .collection("friends")
      .doc(targetUid)
      .get();

    if (existingFriendDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "ALREADY_FRIENDS", message: "You are already friends with this user." } },
        { status: 400 }
      );
    }

    // Caller info
    const callerDoc = await adminDb().collection("users").doc(caller.uid).get();
    const callerData = callerDoc.data() || {};
    const targetData = targetDoc.data() || {};

    const requestId = `${caller.uid}_${targetUid}`;
    const requestRef = adminDb().collection("friend_requests").doc(requestId);

    await requestRef.set({
      id: requestId,
      fromUid: caller.uid,
      fromName: callerData.displayName || "Learner",
      fromUsername: callerData.username || "",
      toUid: targetUid,
      toName: targetData.displayName || "Learner",
      toUsername: targetData.username || "",
      status: "pending",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: { message: "Friend request sent successfully!" },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = handleRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Invalid request payload" } },
        { status: 400 }
      );
    }

    const { requestId, action } = parsed.data;
    const requestRef = adminDb().collection("friend_requests").doc(requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Friend request not found" } },
        { status: 404 }
      );
    }

    const reqData = requestDoc.data()!;
    if (reqData.toUid !== caller.uid) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Unauthorized to answer this friend request" } },
        { status: 403 }
      );
    }

    if (action === "accept") {
      const fromUid = reqData.fromUid;
      const toUid = reqData.toUid;

      const [userFromDoc, userToDoc] = await Promise.all([
        adminDb().collection("users").doc(fromUid).get(),
        adminDb().collection("users").doc(toUid).get(),
      ]);

      const fromData = userFromDoc.data() || {};
      const toData = userToDoc.data() || {};

      const batch = adminDb().batch();

      // Reciprocal friendship records
      const friendRef1 = adminDb().collection("users").doc(toUid).collection("friends").doc(fromUid);
      batch.set(friendRef1, {
        uid: fromUid,
        displayName: fromData.displayName || "Friend",
        username: fromData.username || "",
        email: fromData.email || null,
        photoURL: fromData.photoURL || null,
        since: Timestamp.now(),
      });

      const friendRef2 = adminDb().collection("users").doc(fromUid).collection("friends").doc(toUid);
      batch.set(friendRef2, {
        uid: toUid,
        displayName: toData.displayName || "Friend",
        username: toData.username || "",
        email: toData.email || null,
        photoURL: toData.photoURL || null,
        since: Timestamp.now(),
      });

      // Update request status
      batch.update(requestRef, {
        status: "accepted",
        updatedAt: Timestamp.now(),
      });

      await batch.commit();

      return NextResponse.json({
        ok: true,
        data: { message: "Friend request accepted! You can now message each other." },
      });
    } else {
      // Decline
      await requestRef.update({
        status: "declined",
        updatedAt: Timestamp.now(),
      });

      return NextResponse.json({
        ok: true,
        data: { message: "Friend request declined." },
      });
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
