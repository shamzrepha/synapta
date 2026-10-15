import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannel } from "@/lib/live/server";
import { MAX_GROUPS_PER_USER, MAX_MEMBERS } from "@/lib/groups/server";

export const runtime = "nodejs";

const schema = z.object({ code: z.string().trim().min(6).max(12) });

/** Join a group through its invite link/code. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "group_join", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const { code } = await parseJson(req, schema);
    const found = await adminDb().collection("studyGroups").where("inviteCode", "==", code.toUpperCase()).limit(1).get();
    if (found.empty) throw new ApiError(404, "NOT_FOUND", "That invite link isn't valid any more.");
    const doc = found.docs[0];
    const mine = await adminDb().collection("studyGroups").where("memberUids", "array-contains", caller.uid).limit(MAX_GROUPS_PER_USER + 1).get();
    const already = Array.isArray(doc.data().memberUids) && doc.data().memberUids.includes(caller.uid);
    if (!already && mine.size >= MAX_GROUPS_PER_USER) throw new ApiError(400, "LIMIT", `You can be in up to ${MAX_GROUPS_PER_USER} groups.`);
    if (!already) {
      await adminDb().runTransaction(async (t) => {
        const cur = await t.get(doc.ref);
        const members: string[] = cur.data()?.memberUids || [];
        if (members.includes(caller.uid)) return;
        if (members.length >= MAX_MEMBERS) throw new ApiError(409, "FULL", "This group is full.");
        t.update(doc.ref, { memberUids: FieldValue.arrayUnion(caller.uid), [`roles.${caller.uid}`]: "member" });
      });
      await bumpChannel(`group:${doc.id}`);
    }
    return NextResponse.json({ ok: true, data: { id: doc.id, name: doc.data().name } });
  } catch (error) {
    return handleAuthError(error);
  }
}
