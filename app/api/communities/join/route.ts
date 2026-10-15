import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { normalizeCode } from "@/lib/communities/rules";
import { communityRef, userCommunityRef } from "@/lib/communities/server";

export const runtime = "nodejs";

const schema = z.object({ communityId: z.string().max(60).optional(), code: z.string().max(20).optional() });

/** Join an open community by id, or any community with its join code. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "community_join", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { communityId, code } = await parseJson(req, schema);

    let id = communityId || "";
    if (code) {
      const c = normalizeCode(code);
      if (c.length < 4) throw new ApiError(400, "VALIDATION", "Enter the join code.");
      const found = await adminDb().collection("communities").where("joinCode", "==", c).limit(1).get();
      if (found.empty) throw new ApiError(404, "NOT_FOUND", "No community has that code.");
      id = found.docs[0].id;
    }
    if (!id) throw new ApiError(400, "VALIDATION", "Pick a community or enter a code.");

    const ref = communityRef(id);
    const memberRef = ref.collection("members").doc(caller.uid);
    await adminDb().runTransaction(async (t) => {
      const [c, m] = await Promise.all([t.get(ref), t.get(memberRef)]);
      if (!c.exists) throw new ApiError(404, "NOT_FOUND", "Community not found.");
      if (m.exists) return;
      if (!code && c.data()!.joinMode !== "open") throw new ApiError(403, "FORBIDDEN", "This community needs a join code.");
      const now = Date.now();
      t.set(memberRef, { uid: caller.uid, role: "member", joinedAtMs: now });
      t.update(ref, { memberCount: FieldValue.increment(1) });
      t.set(userCommunityRef(caller.uid, id), { role: "member", joinedAtMs: now });
    });
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
