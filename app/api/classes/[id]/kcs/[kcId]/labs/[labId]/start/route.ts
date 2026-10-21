import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError } from "@/lib/api/errors";
import { z } from "zod";
import { readLabs, startLab } from "@/lib/studio/labs";

export const runtime = "nodejs";

/** Opens (creating on first use) the caller's own copy of a topic lab. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string; labId: string }> }) {
  try {
    const { id: classId, kcId, labId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const lab = (await readLabs(classId, kcId)).find((l) => l.id === labId);
    if (!lab || (!lab.published && !access.canMutate)) throw new ApiError(404, "NOT_FOUND", "Lab not found");
    // body is optional: { proof: true } starts the "rebuild it yourself" copy from an empty bench
    const raw = await req.text();
    let body: unknown = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        throw new ApiError(400, "BAD_JSON", "Malformed JSON request body");
      }
    }
    const parsed = z.object({ proof: z.boolean().optional() }).safeParse(body);
    if (!parsed.success) throw new ApiError(400, "VALIDATION", "proof must be true or false");
    const proof = !!parsed.data.proof;
    const designId = await startLab(caller, classId, kcId, lab, { proof });
    return NextResponse.json({ ok: true, data: { designId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
