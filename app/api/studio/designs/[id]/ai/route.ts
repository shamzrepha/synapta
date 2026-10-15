import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { commitDesign, loadDesign } from "@/lib/studio/store";
import { editDesign } from "@/lib/studio/design-ai";
import { parseSpec } from "@/lib/studio/spec";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

/** "Tell the AI what to change" → a new commit authored by the person who asked. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_ai", limit: 8, windowMs: 60_000 });
    if (limited) return limited;
    const { instruction } = await parseJson(req, z.object({ instruction: z.string().trim().min(3).max(1500) }));
    const { data } = await loadDesign(id, caller, "edit");
    const out = await editDesign({ spec: parseSpec(data.spec), instruction, userId: caller.uid });
    const r = await commitDesign({ id, user: caller, spec: out.spec, parentId: data.headCommitId, message: `AI: ${out.message || instruction}`.slice(0, 200), source: "ai" });
    return NextResponse.json({ ok: true, data: r });
  } catch (error) {
    return handleAuthError(error);
  }
}
