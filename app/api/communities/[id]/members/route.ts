import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { communityRef, memberRole, userCommunityRef } from "@/lib/communities/server";

export const runtime = "nodejs";

async function removeMember(id: string, uid: string) {
  const ref = communityRef(id);
  const memberRef = ref.collection("members").doc(uid);
  await adminDb().runTransaction(async (t) => {
    const m = await t.get(memberRef);
    if (!m.exists) return;
    t.delete(memberRef);
    t.update(ref, { memberCount: FieldValue.increment(-1) });
    t.delete(userCommunityRef(uid, id));
  });
}

/** Leave the community. Owners can't leave (they would orphan it). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const role = await memberRole(id, caller.uid);
    if (!role) throw new ApiError(404, "NOT_FOUND", "You're not in this community.");
    if (role === "owner") throw new ApiError(400, "OWNER_CANNOT_LEAVE", "Owners can't leave their own community..");
    await removeMember(id, caller.uid);
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Owner removes a member. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const { uid } = await parseJson(req, z.object({ uid: z.string().min(1).max(128) }));
    if ((await memberRole(id, caller.uid)) !== "owner") throw new ApiError(403, "FORBIDDEN", "Only the owner can remove members.");
    if (uid === caller.uid) throw new ApiError(400, "VALIDATION", "You can't remove yourself.");
    await removeMember(id, uid);
    return NextResponse.json({ ok: true, data: { uid } });
  } catch (error) {
    return handleAuthError(error);
  }
}
