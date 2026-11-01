import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { applyMapProposal } from "@/lib/teacher/materialRouter";

export const runtime = "nodejs";

const applySchema = z.object({ operationIds: z.array(z.string().max(200)).max(500).optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  try {
    const { id, pid } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    const parsed = applySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw parsed.error;
    const body = parsed.data;
    const result = await applyMapProposal({
      classId: id,
      proposalId: pid,
      operationIds: body.operationIds,
    });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
