import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { equipItem, getShopState } from "@/lib/shop/server";
import { ALL_SLOTS, type EquipSlot } from "@/lib/shop/catalog";

export const runtime = "nodejs";

const Body = z.object({
  slot: z.enum(ALL_SLOTS as [string, ...string[]]),
  itemId: z.string().min(1).max(60).nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "shop-equip", limit: 40, windowMs: 60_000 });
    if (limited) return limited;
    const { slot, itemId } = await parseJson(req, Body);
    await equipItem(caller.uid, slot as EquipSlot, itemId);
    return NextResponse.json({ ok: true, data: await getShopState(caller.uid) });
  } catch (error) {
    return handleAuthError(error);
  }
}
