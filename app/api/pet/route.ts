import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { dayIdFor } from "@/lib/game/quests";
import { getShopState } from "@/lib/shop/server";
import { cleanPetName, petMood } from "@/lib/pet/mood";

export const runtime = "nodejs";

/** Days between two day ids (YYYY-MM-DD). */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86_400_000)) : 0;
}

/** Sprout: the learner's name for it, what it wears, and the mood its colour shows (from streak, time away and mastery). */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const [userSnap, shop, masterySnap] = await Promise.all([
      adminDb().collection("users").doc(caller.uid).get(),
      getShopState(caller.uid),
      adminDb().collection("mastery").where("uid", "==", caller.uid).limit(30).get().catch(() => null),
    ]);
    const u = userSnap.data() || {};
    const today = dayIdFor();
    const last = typeof u.lastActiveDate === "string" ? u.lastActiveDate : null;
    const daysAway = last ? daysBetween(last, today) : 0;
    const ps = (masterySnap?.docs || []).map((d) => d.data().pL).filter((x): x is number => typeof x === "number");
    const avgMastery = ps.length >= 3 ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
    const streakDays = Number(u.streakDays || 0);
    const mood = petMood({ streakDays, daysAway, avgMastery });
    const gear: Record<string, string> = {};
    for (const [slot, id] of Object.entries(shop.equipped)) if (slot.startsWith("pet_") && id) gear[slot.slice(4)] = id;
    return NextResponse.json({
      ok: true,
      data: { name: cleanPetName(u.petName), gear, mood, stats: { streakDays, daysAway, avgMastery, xp: Number(u.xp || 0) }, ownedPet: Object.keys(shop.owned).filter((k) => k.startsWith("pet_")) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const NameBody = z.object({ name: z.string().trim().min(1).max(40) });

export async function PUT(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "pet-name", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { name } = await parseJson(req, NameBody);
    const clean = cleanPetName(name);
    await adminDb().collection("users").doc(caller.uid).set({ petName: clean, updatedAt: Timestamp.now() }, { merge: true });
    return NextResponse.json({ ok: true, data: { name: clean } });
  } catch (error) {
    return handleAuthError(error);
  }
}

