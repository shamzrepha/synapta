import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { generateWithFallback } from "@/lib/ai/router";
import { Timestamp } from "@/lib/firebase/admin";
import { NOTES_SYSTEM, NOTE_SOURCE_MAX, generatePrompt, noteTitle } from "@/lib/study/notes";
import { addVersion, notesCol } from "@/lib/study/notes-store";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_NOTES = 60;

const createSchema = z.object({
  title: z.string().trim().max(120).optional(),
  text: z.string().min(40, "There isn't enough text to make notes from.").max(1_000_000),
});

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await notesCol().where("uid", "==", caller.uid).limit(MAX_NOTES).get();
    const items = snap.docs
      .map((d) => {
        const x = d.data();
        return { id: d.id, title: String(x.title || "Study notes"), sourceTitle: String(x.sourceTitle || ""), updatedAt: x.updatedAt?.toDate?.().toISOString?.() || "" };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return NextResponse.json({ ok: true, data: { notes: items } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Makes structured study notes from the text of any source and saves them as version 1. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "study_notes", limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);
    const mine = await notesCol().where("uid", "==", caller.uid).limit(MAX_NOTES + 1).get();
    if (mine.size >= MAX_NOTES) throw new ApiError(409, "LIMIT", `You can keep up to ${MAX_NOTES} sets of notes. Delete one to make room.`);

    await checkRateLimitAndQuota(caller.uid, 9000);
    const sourceTitle = (body.title || "").trim() || "Untitled";
    const sourceText = body.text.trim().slice(0, NOTE_SOURCE_MAX * 1.25);
    const r = await generateWithFallback({
      task: "study_guide",
      systemInstruction: NOTES_SYSTEM,
      userPrompt: generatePrompt(sourceTitle, sourceText),
      temperature: 0.3,
      userId: caller.uid,
    });
    const markdown = (r.text || "").trim();
    if (markdown.length < 40) throw new ApiError(502, "AI_GENERATION_FAILED", "The AI couldn't make notes from that. Please try again.");

    const ref = notesCol().doc();
    await ref.set({ uid: caller.uid, title: noteTitle(markdown, sourceTitle), sourceTitle, sourceText, head: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    await addVersion(ref.id, markdown, "First draft");
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
