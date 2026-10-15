export type ShopKind = "theme" | "frame" | "title" | "freeze" | "recovery";
export type EquipSlot = "theme" | "frame" | "title";

export interface ShopItem {
  id: string;
  kind: ShopKind;
  name: string;
  description: string;
  emoji: string;
  price: number;
  /** theme: 10 hex shades (50..900) replacing Tailwind's teal scale */
  palette?: string[];
  /** frame: tailwind ring classes for the avatar preview */
  frameClass?: string;
  /** title: text shown under the name */
  titleText?: string;
}

export const THEME_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export const SHOP_ITEMS: ShopItem[] = [
  { id: "theme_ocean", kind: "theme", name: "Ocean", description: "Cool blue accents.", emoji: "🌊", price: 150,
    palette: ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a"] },
  { id: "theme_sunset", kind: "theme", name: "Sunset", description: "Warm orange accents.", emoji: "🌇", price: 150,
    palette: ["#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12"] },
  { id: "theme_grape", kind: "theme", name: "Grape", description: "Rich violet accents.", emoji: "🍇", price: 200,
    palette: ["#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95"] },
  { id: "theme_rose", kind: "theme", name: "Rose", description: "Soft rose accents.", emoji: "🌹", price: 200,
    palette: ["#fff1f2", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239", "#881337"] },
  { id: "theme_forest", kind: "theme", name: "Forest", description: "Deep green accents.", emoji: "🌲", price: 250,
    palette: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b"] },

  { id: "frame_gold", kind: "frame", name: "Gold frame", description: "A golden ring around your avatar.", emoji: "🥇", price: 300, frameClass: "ring-4 ring-amber-400" },
  { id: "frame_neon", kind: "frame", name: "Neon frame", description: "A glowing cyan ring.", emoji: "💠", price: 300, frameClass: "ring-4 ring-cyan-400" },
  { id: "frame_flame", kind: "frame", name: "Flame frame", description: "A fiery red ring.", emoji: "🔥", price: 350, frameClass: "ring-4 ring-rose-500" },

  { id: "title_curious", kind: "title", name: "Title: The Curious", description: "Show off your curiosity.", emoji: "🔍", price: 100, titleText: "The Curious" },
  { id: "title_night_owl", kind: "title", name: "Title: Night Owl", description: "For late-night learners.", emoji: "🦉", price: 120, titleText: "Night Owl" },
  { id: "title_streak_keeper", kind: "title", name: "Title: Streak Keeper", description: "Consistency is everything.", emoji: "🔥", price: 200, titleText: "Streak Keeper" },
  { id: "title_polymath", kind: "title", name: "Title: Polymath", description: "Curious about everything.", emoji: "📚", price: 400, titleText: "Polymath" },

  { id: "streak_freeze", kind: "freeze", name: "Streak freeze", description: "Covers one missed day automatically. You can hold up to 3.", emoji: "🧊", price: 120 },
  { id: "streak_recovery", kind: "recovery", name: "Streak recovery", description: "Restore a streak you broke in the last 24 hours. Price depends on streak length.", emoji: "🩹", price: 0 },
];

const BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): ShopItem | undefined {
  return BY_ID.get(id);
}

export function isEquippable(item: ShopItem): boolean {
  return item.kind === "theme" || item.kind === "frame" || item.kind === "title";
}

/** Spendable XP never goes below zero; total XP and level are unaffected by spending. */
export function spendableXp(xp: number, xpSpent: number): number {
  return Math.max(0, Math.floor((xp || 0) - (xpSpent || 0)));
}

export type PurchaseCheck = { ok: true } | { ok: false; code: string; message: string };

/** Pure purchase validation used inside the Firestore transaction. */
export function checkPurchase(p: {
  item: ShopItem;
  price: number;
  xp: number;
  xpSpent: number;
  owned: Record<string, unknown>;
  freezes: number;
  maxFreezes: number;
}): PurchaseCheck {
  const { item } = p;
  if (isEquippable(item) && p.owned[item.id]) return { ok: false, code: "ALREADY_OWNED", message: "You already own this item." };
  if (item.kind === "freeze" && p.freezes >= p.maxFreezes) {
    return { ok: false, code: "FREEZES_FULL", message: `You can hold at most ${p.maxFreezes} freezes.` };
  }
  if (spendableXp(p.xp, p.xpSpent) < p.price) return { ok: false, code: "INSUFFICIENT_XP", message: "Not enough spendable XP." };
  return { ok: true };
}

/** Accent CSS variables for an equipped theme (overrides Tailwind v4's teal scale + base accent tokens). */
export function themeVariables(item: ShopItem | undefined): Record<string, string> {
  if (!item?.palette || item.palette.length !== THEME_SHADES.length) return {};
  const vars: Record<string, string> = {};
  THEME_SHADES.forEach((shade, i) => {
    vars[`--color-teal-${shade}`] = item.palette![i];
  });
  vars["--primary"] = item.palette[6];
  vars["--accent"] = item.palette[4];
  vars["--ring"] = item.palette[4];
  return vars;
}
