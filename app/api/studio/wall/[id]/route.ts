import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { loadDesign } from "@/lib/studio/store";
import { wallItemFrom } from "@/lib/studio/wall-server";
import { bomFor } from "@/lib/studio/bom";
import type { DesignSpec } from "@/lib/studio/spec";

export const runtime = "nodejs";

/** One Maker Wall project: card data, the auto-generated parts list, remix credit and my star. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref, data, isOwner } = await loadDesign(id, caller);
    const item = wallItemFrom(id, data);
    if (!item) throw new ApiError(404, "NOT_FOUND", "This project is not on the Maker Wall.");
    const star = await ref.collection("stars").doc(caller.uid).get();
    return NextResponse.json({
      ok: true,
      data: { item, bom: bomFor(data.spec as DesignSpec), starred: star.exists, isOwner, forkedFrom: data.forkedFrom ? { id: data.forkedFrom.id, title: data.forkedFrom.title } : null },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
