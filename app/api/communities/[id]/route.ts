import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { getPublicProfiles } from "@/lib/social/profile";
import { loadCommunity, memberRole, communityRef } from "@/lib/communities/server";

export const runtime = "nodejs";

/** Community details. Open communities show a preview to non-members; members also get the member list. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const c = await loadCommunity(id);
    const role = await memberRole(id, caller.uid);
    if (!role && c.joinMode !== "open") throw new ApiError(403, "FORBIDDEN", "This community is private. Join with a code.");

    const base = { id, name: c.name, kind: c.kind, description: c.description, joinMode: c.joinMode, memberCount: c.memberCount, role, joinCode: role === "owner" ? c.joinCode : undefined };
    if (!role) return NextResponse.json({ ok: true, data: { ...base, members: [] } });

    const snap = await communityRef(id).collection("members").limit(200).get();
    const profiles = await getPublicProfiles(snap.docs.map((d) => d.id));
    const members = snap.docs
      .map((d) => {
        const p = profiles.get(d.id);
        return { uid: d.id, role: String(d.data().role || "member"), displayName: p?.displayName || "Learner", username: p?.username || null, photoURL: p?.photoURL || null, joinedAtMs: d.data().joinedAtMs || 0 };
      })
      .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner") || a.joinedAtMs - b.joinedAtMs);
    return NextResponse.json({ ok: true, data: { ...base, members } });
  } catch (error) {
    return handleAuthError(error);
  }
}
