import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannels } from "@/lib/live/server";
import { validateQuestion } from "@/lib/ask/rules";
import { serializeQuestion } from "@/lib/ask/server";

export const runtime = "nodejs";

/** GET /api/ask?sort=new|top|open — anonymous questions. The asker's uid is never returned (admins excepted). */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const sort = req.nextUrl.searchParams.get("sort") || "new";
    const snap = await adminDb().collection("askQuestions").orderBy("createdAt", "desc").limit(100).get();
    const rows = snap.docs.filter((d) => !d.data().deleted);
    const refs = rows.map((d) => d.ref.collection("upvotes").doc(caller.uid));
    const ups = refs.length ? await adminDb().getAll(...refs) : [];
    const upvoted = new Set(ups.filter((s) => s.exists).map((s) => s.ref.parent.parent!.id));
    let questions = rows.map((d) => serializeQuestion(d.id, d.data(), caller.uid, caller.role === "admin", upvoted.has(d.id)));
    if (sort === "top") questions = questions.sort((a, b) => b.upvoteCount - a.upvoteCount || (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (sort === "open") questions = questions.filter((q) => !q.acceptedReplyId);
    return NextResponse.json({ ok: true, data: { questions } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const createSchema = z.object({
  text: z.string().max(2000),
  subject: z.string().trim().max(40).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "ask_post", limit: 5, windowMs: 3600_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);
    const v = validateQuestion(body.text);
    if (!v.ok) throw new ApiError(400, "VALIDATION", v.message);
    const ref = adminDb().collection("askQuestions").doc();
    await ref.set({
      id: ref.id,
      authorUid: caller.uid, // server-side only
      text: v.text,
      subject: body.subject ? body.subject.toLowerCase() : null,
      upvoteCount: 0,
      answerCount: 0,
      acceptedReplyId: null,
      deleted: false,
      createdAt: Timestamp.now(),
    });
    await bumpChannels(["ask"]);
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
