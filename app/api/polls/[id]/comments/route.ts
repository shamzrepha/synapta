import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannels } from "@/lib/live/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { iso, countLinks } from "@/lib/community/util";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const ref = adminDb().collection("polls").doc(id);
    const s = await ref.get();
    if (!s.exists || s.data()!.deleted) throw new ApiError(404, "NOT_FOUND", "Poll not found");
    const snap = await ref.collection("comments").orderBy("createdAt", "asc").limit(200).get();
    const profiles = await getPublicProfiles(snap.docs.map((d) => d.data().authorUid));
    const comments = snap.docs.map((d) => {
      const c = d.data();
      const p = profiles.get(c.authorUid);
      return { id: d.id, text: c.text as string, authorName: p?.displayName || "Learner", authorPhoto: p?.photoURL || null, mine: c.authorUid === caller.uid, createdAt: iso(c.createdAt) };
    });
    return NextResponse.json({ ok: true, data: { comments } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({ text: z.string().trim().min(1).max(500) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "poll_comment", limit: 20, windowMs: 600_000 });
    if (limited) return limited;
    const { text } = await parseJson(req, schema);
    if (countLinks(text) > 1) throw new ApiError(400, "VALIDATION", "At most 1 link per comment.");
    const ref = adminDb().collection("polls").doc(id);
    const s = await ref.get();
    if (!s.exists || s.data()!.deleted) throw new ApiError(404, "NOT_FOUND", "Poll not found");
    await ref.collection("comments").add({ authorUid: caller.uid, text, createdAt: Timestamp.now() });
    await ref.update({ commentCount: FieldValue.increment(1) });
    await bumpChannels([`poll:${id}`]);
    return NextResponse.json({ ok: true, data: { saved: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
