import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { removeDeviceSessionFromFirestore } from "@/lib/auth/concurrent-sessions";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;

    await removeDeviceSessionFromFirestore(caller.uid, id);

    return NextResponse.json({
      ok: true,
      data: { removed: true, id },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
