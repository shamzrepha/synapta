import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { generateWithFallback } from "@/lib/ai/router";
import { REFINE_PRESETS, REFINE_SYSTEM, noteTitle, refinePrompt, sourcePage } from "@/lib/study/notes";
import { addVersion, loadOwnNote, noteRef, readVersions } from "@/lib/study/notes-store";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** The notes (latest version, or ?version=N), the version list, and — with ?page=N — that page of the original source. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { data } = await loadOwnNote(id, caller.uid);
    const page = Number(req.nextUrl.searchParams.get("page") || 0);
    if (page > 0) return NextResponse.json({ ok: true, data: { page, text: sourcePage(String(data.sourceText || ""), page) } });
    const versions = await readVersions(id);
    const want = Number(req.nextUrl.searchParams.get("version") || 0);
    const head = (want > 0 ? versions.find((v) => v.n === want) : undefined) ?? versions.find((v) => v.n === data.head) ?? versions[0];
    return NextResponse.json({
      ok: true,
      data: {
        id,
        title: data.title,
        sourceTitle: data.sourceTitle,
        hasPages: /\[Page \d+\]/.test(String(data.sourceText || "")),
        head: Number(data.head) || 0,
        shown: head?.n ?? 0,
        markdown: head?.markdown ?? "",
        versions: versions.map((v) => ({ n: v.n, instruction: v.instruction, createdAt: v.createdAt })),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const refineSchema = z.object({ preset: z.string().optional(), instruction: z.string().trim().max(500).optional() });

/** Refines the notes ("simpler", "exam focus", "in Igbo"...) and saves the result as a new version. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "study_notes_refine", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, refineSchema);
    const preset = REFINE_PRESETS.find((p) => p.id === body.preset);
    const instruction = preset?.instruction || body.instruction;
    if (!instruction) throw new ApiError(400, "VALIDATION", "Tell Sunroot what to change.");
    const label = preset?.label || instruction;

    const { data } = await loadOwnNote(id, caller.uid);
    const versions = await readVersions(id);
    const current = versions.find((v) => v.n === data.head) ?? versions[0];
    if (!current) throw new ApiError(404, "NOT_FOUND", "Notes not found");

    await checkRateLimitAndQuota(caller.uid, 9000);
    const r = await generateWithFallback({
      task: "study_guide",
      systemInstruction: REFINE_SYSTEM,
      userPrompt: refinePrompt(current.markdown, String(data.sourceText || ""), instruction),
      temperature: 0.3,
      userId: caller.uid,
    });
    const markdown = (r.text || "").trim();
    if (markdown.length < 40) throw new ApiError(502, "AI_GENERATION_FAILED", "The AI couldn't change the notes. Please try again.");
    const n = await addVersion(id, markdown, label);
    await noteRef(id).update({ title: noteTitle(markdown, String(data.title || "Study notes")) });
    return NextResponse.json({ ok: true, data: { head: n } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const restoreSchema = z.object({ version: z.number().int().min(1) });

/** Puts an older version back as the newest one (history is kept). */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { version } = await parseJson(req, restoreSchema);
    await loadOwnNote(id, caller.uid);
    const snap = await noteRef(id).collection("versions").doc(String(version)).get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "That version is gone.");
    const n = await addVersion(id, String(snap.data()!.markdown), `Restored version ${version}`);
    return NextResponse.json({ ok: true, data: { head: n } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadOwnNote(id, caller.uid);
    const versions = await ref.collection("versions").get();
    await Promise.all(versions.docs.map((d) => d.ref.delete()));
    await ref.delete();
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
