import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { purchaseItem, getShopState } from "@/lib/shop/server";

export const runtime = "nodejs";

const Body = z.object({ itemId: z.string().min(1).max(60) });

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "shop-buy", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { itemId } = await parseJson(req, Body);
    const result = await purchaseItem(caller.uid, itemId);
    return NextResponse.json({ ok: true, data: { ...result, state: await getShopState(caller.uid) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
