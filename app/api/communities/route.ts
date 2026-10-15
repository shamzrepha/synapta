import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { generateJoinCode, KINDS, validateCommunity } from "@/lib/communities/rules";
import { userCommunityRef } from "@/lib/communities/server";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().max(100),
  description: z.string().max(400).optional(),
  kind: z.enum(KINDS),
  joinMode: z.enum(["open", "code"]),
});

function publicShape(id: string, d: FirebaseFirestore.DocumentData, role: string | null) {
  return {
    id,
    name: d.name,
    kind: d.kind,
    description: d.description || "",
    joinMode: d.joinMode,
    memberCount: d.memberCount || 0,
    role,
    // only owners ever see the join code
    joinCode: role === "owner" ? d.joinCode : undefined,
  };
}

/** My communities plus open ones to discover. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const mineSnap = await adminDb().collection("users").doc(caller.uid).collection("communities").limit(50).get();
    const roles = new Map(mineSnap.docs.map((d) => [d.id, String(d.data().role || "member")]));
    const refs = mineSnap.docs.map((d) => adminDb().collection("communities").doc(d.id));
    const mineDocs = refs.length ? await adminDb().getAll(...refs) : [];
    const mine = mineDocs.filter((s) => s.exists).map((s) => publicShape(s.id, s.data()!, roles.get(s.id) || "member"));

    const discoverSnap = await adminDb().collection("communities").orderBy("createdAtMs", "desc").limit(40).get();
    const discover = discoverSnap.docs
      .filter((d) => d.data().joinMode === "open" && !roles.has(d.id))
      .map((d) => publicShape(d.id, d.data(), null))
      .slice(0, 20);
    return NextResponse.json({ ok: true, data: { mine, discover } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "community_create", limit: 5, windowMs: 60 * 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);
    const problem = validateCommunity(body);
    if (problem) throw new ApiError(400, "VALIDATION", problem);

    const ref = adminDb().collection("communities").doc();
    const now = Date.now();
    await ref.set({
      name: body.name.trim(),
      kind: body.kind,
      description: (body.description || "").trim(),
      ownerUid: caller.uid,
      joinMode: body.joinMode,
      joinCode: generateJoinCode(),
      memberCount: 1,
      createdAtMs: now,
    });
    await ref.collection("members").doc(caller.uid).set({ uid: caller.uid, role: "owner", joinedAtMs: now });
    await userCommunityRef(caller.uid, ref.id).set({ role: "owner", joinedAtMs: now });
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
