import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { MAX_STREAK_FREEZES } from "@/lib/game/streak";
import { dayIdFor } from "@/lib/game/quests";
import { addDays, recoveryCost, recoveryState } from "@/lib/streak/logic";
import { checkPurchase, getItem, isEquippable, spendableXp, type EquipSlot } from "./catalog";

export interface ShopState {
  xp: number;
  xpSpent: number;
  spendable: number;
  owned: Record<string, string>;
  equipped: Partial<Record<EquipSlot, string>>;
  freezes: number;
  maxFreezes: number;
  recovery: { available: boolean; cost: number; streak: number; expiresAt: string | null };
  ledger: Array<{ id: string; itemId: string; name: string; emoji: string; price: number; kind: string; createdAt: string | null }>;
}

function iso(v: unknown): string | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  return d ? d.toISOString() : null;
}

function cleanOwned(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (getItem(k)) out[k] = iso(v) || (typeof v === "string" ? v : "");
    }
  }
  return out;
}

function cleanEquipped(raw: unknown, owned: Record<string, string>): Partial<Record<EquipSlot, string>> {
  const out: Partial<Record<EquipSlot, string>> = {};
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const slot of ["theme", "frame", "title"] as EquipSlot[]) {
    const id = r[slot];
    if (typeof id === "string" && owned[id] !== undefined && getItem(id)?.kind === slot) out[slot] = id;
  }
  return out;
}

export async function getShopState(uid: string): Promise<ShopState> {
  const userRef = adminDb().collection("users").doc(uid);
  const [userSnap, ledgerSnap] = await Promise.all([
    userRef.get(),
    userRef.collection("shopLedger").orderBy("createdAt", "desc").limit(30).get().catch(() => null),
  ]);
  const u = userSnap.data() || {};
  const owned = cleanOwned(u.shopOwned);
  const xp = u.xp || 0;
  const xpSpent = u.xpSpent || 0;
  const freezes = u.streakFreezes || 0;
  const rec = recoveryState({ streakDays: u.streakDays || 0, lastActiveDate: u.lastActiveDate || null, freezes, today: dayIdFor() });
  return {
    xp,
    xpSpent,
    spendable: spendableXp(xp, xpSpent),
    owned,
    equipped: cleanEquipped(u.shopEquipped, owned),
    freezes,
    maxFreezes: MAX_STREAK_FREEZES,
    recovery: rec,
    ledger: (ledgerSnap?.docs || []).map((d) => {
      const x = d.data();
      return {
        id: d.id,
        itemId: String(x.itemId || ""),
        name: String(x.name || ""),
        emoji: String(x.emoji || ""),
        price: Number(x.price || 0),
        kind: String(x.kind || ""),
        createdAt: iso(x.createdAt),
      };
    }),
  };
}

/**
 * Atomic purchase: balance check, spend, grant and ledger entry happen in one Firestore
 * transaction, so a double-click cannot spend twice (the second attempt sees the new state).
 */
export async function purchaseItem(uid: string, itemId: string): Promise<{ spent: number }> {
  const item = getItem(itemId);
  if (!item) throw new ApiError(404, "NOT_FOUND", "Unknown shop item.");
  const userRef = adminDb().collection("users").doc(uid);
  const ledgerRef = userRef.collection("shopLedger").doc();

  return adminDb().runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "User not found.");
    const u = snap.data()!;
    const today = dayIdFor();
    const freezes = u.streakFreezes || 0;
    let price = item.price;
    if (item.kind === "recovery") {
      const rec = recoveryState({ streakDays: u.streakDays || 0, lastActiveDate: u.lastActiveDate || null, freezes, today });
      if (!rec.available) throw new ApiError(409, "NOT_AVAILABLE", "There is no recently broken streak to recover.");
      price = recoveryCost(u.streakDays || 0);
    }
    const check = checkPurchase({
      item,
      price,
      xp: u.xp || 0,
      xpSpent: u.xpSpent || 0,
      owned: (u.shopOwned || {}) as Record<string, unknown>,
      freezes,
      maxFreezes: MAX_STREAK_FREEZES,
    });
    if (!check.ok) throw new ApiError(409, check.code, check.message);

    const update: Record<string, unknown> = {
      xpSpent: (u.xpSpent || 0) + price,
      updatedAt: Timestamp.now(),
    };
    if (isEquippable(item)) update[`shopOwned.${item.id}`] = Timestamp.now();
    if (item.kind === "freeze") update.streakFreezes = freezes + 1;
    if (item.kind === "recovery") update.lastActiveDate = addDays(today, -1);
    t.update(userRef, update);
    t.set(ledgerRef, {
      itemId: item.id,
      name: item.name,
      emoji: item.emoji,
      kind: item.kind,
      price,
      createdAt: Timestamp.now(),
    });
    return { spent: price };
  });
}

export async function equipItem(uid: string, slot: EquipSlot, itemId: string | null): Promise<void> {
  const userRef = adminDb().collection("users").doc(uid);
  await adminDb().runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "User not found.");
    if (itemId === null) {
      t.update(userRef, { [`shopEquipped.${slot}`]: null });
      return;
    }
    const item = getItem(itemId);
    if (!item || item.kind !== slot) throw new ApiError(400, "VALIDATION", "That item can't go in this slot.");
    const owned = (snap.data()!.shopOwned || {}) as Record<string, unknown>;
    if (!owned[itemId]) throw new ApiError(403, "NOT_OWNED", "You don't own this item yet.");
    t.update(userRef, { [`shopEquipped.${slot}`]: itemId });
  });
}
