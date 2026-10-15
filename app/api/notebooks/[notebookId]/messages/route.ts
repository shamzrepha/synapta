import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { loadNotebook, touch } from "@/lib/notebooks/store";
import { z } from "zod";

export const runtime = "nodejs";

const citation = z.object({ tag: z.string().max(20), sourceId: z.string().max(100), sourceTitle: z.string().max(200), excerpt: z.string().max(2000) });
const schema = z.object({
  question: z.string().trim().min(1).max(4000),
  answer: z.string().min(1).max(40_000),
  citations: z.array(citation).max(40).default([]),
});

/** Saves an AI Q&A exchange to the notebook so every member sees the shared history. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ notebookId: string }> }) {
  try {
    const { notebookId } = await params;
    const caller = await requireUser(req);
    const body = await parseJson(req, schema);
    const { ref } = await loadNotebook(notebookId, caller.uid, "editor");
    const me = await adminDb().collection("users").doc(caller.uid).get();
    const name = me.data()?.displayName || "Learner";
    const batch = adminDb().batch();
    const now = Date.now();
    batch.set(ref.collection("messages").doc(), { role: "user", text: body.question, authorUid: caller.uid, authorName: name, citations: [], createdAt: Timestamp.fromMillis(now) });
    batch.set(ref.collection("messages").doc(), { role: "model", text: body.answer, citations: body.citations ?? [], createdAt: Timestamp.fromMillis(now + 1) });
    await batch.commit();
    await touch(notebookId);
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
