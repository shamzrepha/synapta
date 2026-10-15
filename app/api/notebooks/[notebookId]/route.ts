import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { loadNotebook, touch } from "@/lib/notebooks/store";
import { getPublicProfiles } from "@/lib/social/profile";
import { z } from "zod";

export const runtime = "nodejs";

function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

/** Full notebook: sources (with text), chat history, studio outputs and members. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ notebookId: string }> }) {
  try {
    const { notebookId } = await params;
    const caller = await requireUser(req);
    const { ref, nb, role } = await loadNotebook(notebookId, caller.uid);
    const [sources, messages] = await Promise.all([
      ref.collection("sources").orderBy("createdAt", "desc").get(),
      ref.collection("messages").orderBy("createdAt", "desc").limit(80).get(),
    ]);
    const members = await getPublicProfiles(nb.memberIds || []);
    return NextResponse.json({
      ok: true,
      data: {
        notebook: {
          id: notebookId,
          title: nb.title,
          course: nb.course || "General",
          role,
          ownerUid: nb.ownerUid,
          chatId: nb.chatId || null,
          studio: nb.studio || {},
          members: (nb.memberIds || []).map((u: string) => ({
            uid: u,
            displayName: members.get(u)?.displayName || "Learner",
            photoURL: members.get(u)?.photoURL || null,
            role: nb.roles?.[u] || "viewer",
          })),
        },
        sources: sources.docs.map((d) => ({
          id: d.id,
          title: d.data().title,
          type: d.data().type,
          content: d.data().content,
          wordCount: d.data().wordCount || 0,
          truncated: !!d.data().truncated,
          addedBy: d.data().addedBy,
          createdAt: iso(d.data().createdAt),
        })),
        messages: messages.docs
          .map((d) => ({
            id: d.id,
            role: d.data().role,
            text: d.data().text,
            citations: d.data().citations || [],
            authorName: d.data().authorName || null,
            createdAt: iso(d.data().createdAt),
          }))
          .reverse(),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  course: z.string().trim().min(1).max(60).optional(),
  studio: z
    .object({
      studyGuide: z.string().max(200_000).optional(),
      flashcards: z.array(z.object({ front: z.string().max(2000), back: z.string().max(4000) })).max(100).optional(),
      quiz: z.array(z.record(z.unknown())).max(50).optional(),
      podcast: z.record(z.unknown()).optional(),
    })
    .optional(),
});

/** Rename / re-file under another course / save studio outputs (editors). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ notebookId: string }> }) {
  try {
    const { notebookId } = await params;
    const caller = await requireUser(req);
    const body = await parseJson(req, patchSchema);
    await loadNotebook(notebookId, caller.uid, "editor");
    const update: Record<string, unknown> = {};
    if (body.title) update.title = body.title;
    if (body.course) update.course = body.course;
    for (const [k, v] of Object.entries(body.studio || {})) if (v !== undefined) update[`studio.${k}`] = v;
    await touch(notebookId, update);
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Owner deletes the notebook and everything in it. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ notebookId: string }> }) {
  try {
    const { notebookId } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadNotebook(notebookId, caller.uid, "owner");
    await adminDb().recursiveDelete(ref);
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
