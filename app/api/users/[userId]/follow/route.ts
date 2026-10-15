import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { resolveUserRef, setFollow } from "@/lib/social/follow";
import { notify } from "@/lib/notifications/server";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ follow: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "follow", limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const { follow } = await parseJson(req, schema);
    const target = await resolveUserRef(userId);
    if (!target) throw new ApiError(404, "NOT_FOUND", "User not found");
    if (target.uid === caller.uid) throw new ApiError(400, "SELF", "You can't follow yourself.");
    const changed = await setFollow(caller.uid, target.uid, follow);
    if (changed && follow) {
      const me = await adminDb().collection("users").doc(caller.uid).get();
      await notify(target.uid, {
        type: "friend",
        title: `${me.data()?.displayName || "Someone"} started following you`,
        href: me.data()?.username ? `/u/${me.data()!.username}` : `/u/${caller.uid}`,
        icon: "➕",
        actorUid: caller.uid,
      });
    }
    return NextResponse.json({ ok: true, data: { following: follow } });
  } catch (error) {
    return handleAuthError(error);
  }
}
