import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { addSource } from "@/lib/notebooks/store";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  type: z.enum(["pdf", "note"]).default("note"),
  content: z.string().min(1).max(1_000_000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ notebookId: string }> }) {
  try {
    const { notebookId } = await params;
    const caller = await requireUser(req);
    const body = await parseJson(req, schema);
    const id = await addSource(notebookId, caller.uid, { title: body.title, type: body.type ?? "note", content: body.content });
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
