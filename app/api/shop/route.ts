import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getShopState } from "@/lib/shop/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    return NextResponse.json({ ok: true, data: await getShopState(caller.uid) });
  } catch (error) {
    return handleAuthError(error);
  }
}
