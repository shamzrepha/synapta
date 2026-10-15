import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { commitDesign, loadDesign } from "@/lib/studio/store";
import { parseSpec } from "@/lib/studio/spec";
import { z } from "zod";

export const runtime = "nodejs";

/** Restore an older version as a new commit (history is never rewritten). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { commitId } = await parseJson(req, z.object({ commitId: z.string().min(1) }));
    const { ref, data } = await loadDesign(id, caller, "edit");
    const c = await ref.collection("commits").doc(commitId).get();
    if (!c.exists) throw new ApiError(404, "NOT_FOUND", "Version not found");
    const r = await commitDesign({ id, user: caller, spec: parseSpec(c.data()!.spec), parentId: data.headCommitId, message: `Restored “${String(c.data()!.message).slice(0, 80)}”`, source: "revert" });
    return NextResponse.json({ ok: true, data: r });
  } catch (error) {
    return handleAuthError(error);
  }
}
