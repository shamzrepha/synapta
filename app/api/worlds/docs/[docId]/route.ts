import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { col, deleteSourceDoc, loadDocPages } from "@/lib/worlds/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ docId: string }> };

async function ownDoc(docId: string, uid: string) {
  const snap = await col.sourceDocs().doc(docId).get();
  if (!snap.exists || snap.data()?.ownerUid !== uid) throw new ApiError(404, "NOT_FOUND", "That note was not found.");
  return snap;
}

/** The cleaned lines of a note, for the "check these lines" screen and "View in my notes". */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { docId } = await params;
    const user = await requireUser(req);
    const snap = await ownDoc(docId, user.uid);
    return NextResponse.json({ ok: true, data: { title: snap.data()?.title, pages: await loadDocPages(docId) } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const editSchema = z.object({
  edits: z.array(z.object({ pageNo: z.number().int().min(1), lineNo: z.number().int().min(1), text: z.string().trim().min(1).max(600).optional() })).max(300),
});

/** The student accepts or corrects flagged lines. Only the student changes her notes (R2). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { docId } = await params;
    const user = await requireUser(req);
    await ownDoc(docId, user.uid);
    const { edits } = await parseJson(req, editSchema);
    const byPage = new Map<number, typeof edits>();
    edits.forEach((e) => byPage.set(e.pageNo, [...(byPage.get(e.pageNo) ?? []), e]));
    for (const [pageNo, list] of byPage) {
      const ref = col.sourceDocs().doc(docId).collection("pages").doc(String(pageNo));
      const page = (await ref.get()).data() as { lines: Array<{ lineNo: number; text: string; confidence: number; flagged?: boolean; flagReason?: string }> } | undefined;
      if (!page) continue;
      for (const e of list) {
        const line = page.lines.find((l) => l.lineNo === e.lineNo);
        if (!line) continue;
        if (e.text) line.text = e.text;
        line.confidence = 1; // the student has looked at it
        delete line.flagged;
        delete line.flagReason;
      }
      await ref.set(page);
    }
    const pages = await loadDocPages(docId);
    const flaggedCount = pages.flatMap((p) => p.lines).filter((l) => l.flagged).length;
    await col.sourceDocs().doc(docId).update({ flaggedCount, status: flaggedCount ? "cleaned" : "reviewed" });
    return NextResponse.json({ ok: true, data: { flaggedCount } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { docId } = await params;
    const user = await requireUser(req);
    await ownDoc(docId, user.uid);
    await deleteSourceDoc(docId);
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
