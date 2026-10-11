import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { dismissMapProposal } from "@/lib/teacher/materialRouter";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  try {
    const { id, pid } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    await dismissMapProposal({
      classId: id,
      proposalId: pid,
    });

    return NextResponse.json({
      ok: true,
      data: { status: "dismissed", proposalId: pid },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
