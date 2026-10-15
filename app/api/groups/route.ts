import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { loadGroupStreak } from "@/lib/groups/activity";
import { newInviteCode, MAX_GROUPS_PER_USER } from "@/lib/groups/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("studyGroups").where("memberUids", "array-contains", caller.uid).limit(MAX_GROUPS_PER_USER).get();
    const groups = await Promise.all(
      snap.docs.map(async (d) => {
        const g = d.data();
        const streak = await loadGroupStreak(d.id).catch(() => null);
        return {
          id: d.id,
          name: g.name,
          description: g.description || "",
          memberCount: Array.isArray(g.memberUids) ? g.memberUids.length : 0,
          isOwner: g.ownerUid === caller.uid,
          streak: streak?.current ?? 0,
          activeToday: streak?.activeToday ?? false,
        };
      })
    );
    return NextResponse.json({ ok: true, data: { groups } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().default(""),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "group_create", limit: 5, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);
    const mine = await adminDb().collection("studyGroups").where("memberUids", "array-contains", caller.uid).limit(MAX_GROUPS_PER_USER + 1).get();
    if (mine.size >= MAX_GROUPS_PER_USER) throw new ApiError(400, "LIMIT", `You can be in up to ${MAX_GROUPS_PER_USER} groups.`);
    const ref = adminDb().collection("studyGroups").doc();
    await ref.set({
      name: body.name,
      description: body.description,
      ownerUid: caller.uid,
      memberUids: [caller.uid],
      roles: { [caller.uid]: "owner" },
      inviteCode: newInviteCode(),
      notes: { text: "# Group notes\n\nWrite shared notes here.", version: 1, updatedBy: caller.uid, updatedByName: "", updatedAtMs: Date.now() },
      goals: [],
      createdAtMs: Date.now(),
    });
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
