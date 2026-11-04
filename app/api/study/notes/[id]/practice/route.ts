import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { generateWithFallback } from "@/lib/ai/router";
import { Timestamp } from "@/lib/firebase/admin";
import { CARDS_SYSTEM, QUIZ_SYSTEM, cardsSchema, quizSchema } from "@/lib/study/note-practice";
import { clipSource } from "@/lib/study/notes";
import { loadOwnNote, readVersions } from "@/lib/study/notes-store";

export const runtime = "nodejs";
export const maxDuration = 90;

const bodySchema = z.object({ kind: z.enum(["flashcards", "quiz"]), regenerate: z.boolean().optional() });

/** Flashcards or a quiz made from the notes. Made once and saved on the notes; "regenerate" makes a fresh set. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "note_practice", limit: 8, windowMs: 60_000 });
    if (limited) return limited;
    const { kind, regenerate } = await parseJson(req, bodySchema);
    const { ref, data } = await loadOwnNote(id, caller.uid);
    const saved = (data.practice || {}) as Record<string, unknown>;
    if (saved[kind] && !regenerate) return NextResponse.json({ ok: true, data: { [kind === "quiz" ? "questions" : "cards"]: saved[kind] } });

    const versions = await readVersions(id);
    const notes = (versions.find((v) => v.n === data.head) ?? versions[0])?.markdown || "";
    if (!notes) throw new ApiError(404, "NOT_FOUND", "Notes not found");
    await checkRateLimitAndQuota(caller.uid, 5000);

    if (kind === "flashcards") {
      const r = await generateWithFallback({ task: "card_gen", systemInstruction: CARDS_SYSTEM, userPrompt: `NOTES:\n${clipSource(notes, 30_000)}`, schema: cardsSchema, temperature: 0.3, userId: caller.uid });
      if (!r.data) throw new ApiError(502, "AI_GENERATION_FAILED", "The AI couldn't make flashcards. Please try again.");
      await ref.set({ practice: { ...saved, flashcards: r.data.cards }, updatedAt: Timestamp.now() }, { merge: true });
      return NextResponse.json({ ok: true, data: { cards: r.data.cards } });
    }
    const r = await generateWithFallback({ task: "quiz_gen", systemInstruction: QUIZ_SYSTEM, userPrompt: `NOTES:\n${clipSource(notes, 30_000)}`, schema: quizSchema, temperature: 0.3, userId: caller.uid });
    if (!r.data) throw new ApiError(502, "AI_GENERATION_FAILED", "The AI couldn't make a quiz. Please try again.");
    await ref.set({ practice: { ...saved, quiz: r.data.questions }, updatedAt: Timestamp.now() }, { merge: true });
    return NextResponse.json({ ok: true, data: { questions: r.data.questions } });
  } catch (error) {
    return handleAuthError(error);
  }
}
