import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { SHOP_CATEGORIES, shopItems } from "@/lib/studio/parts/shop";

export const runtime = "nodejs";

/** The Maker Space shop: every part with its pinout, datasheet facts, usage snippet and price. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    return NextResponse.json({ ok: true, data: { categories: SHOP_CATEGORIES, items: shopItems() } });
  } catch (error) {
    return handleAuthError(error);
  }
}
