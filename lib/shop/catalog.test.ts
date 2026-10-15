import { describe, it, expect } from "vitest";
import { SHOP_ITEMS, getItem, spendableXp, checkPurchase, themeVariables } from "./catalog";

describe("shop catalogue", () => {
  it("has unique ids and valid themes", () => {
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
    for (const t of SHOP_ITEMS.filter((i) => i.kind === "theme")) expect(t.palette).toHaveLength(10);
  });
  it("computes spendable XP without going negative", () => {
    expect(spendableXp(500, 120)).toBe(380);
    expect(spendableXp(100, 400)).toBe(0);
  });
  it("validates purchases", () => {
    const item = getItem("theme_ocean")!;
    const base = { item, price: item.price, xp: 1000, xpSpent: 0, owned: {}, freezes: 0, maxFreezes: 3 };
    expect(checkPurchase(base).ok).toBe(true);
    expect(checkPurchase({ ...base, owned: { theme_ocean: "x" } })).toMatchObject({ ok: false, code: "ALREADY_OWNED" });
    expect(checkPurchase({ ...base, xp: 200, xpSpent: 100 })).toMatchObject({ ok: false, code: "INSUFFICIENT_XP" });
    const freeze = getItem("streak_freeze")!;
    expect(checkPurchase({ ...base, item: freeze, price: freeze.price, freezes: 3 })).toMatchObject({ code: "FREEZES_FULL" });
    expect(checkPurchase({ ...base, item: freeze, price: freeze.price, freezes: 1, owned: { streak_freeze: "x" } }).ok).toBe(true);
  });
  it("maps a theme to css variables", () => {
    const v = themeVariables(getItem("theme_grape"));
    expect(v["--color-teal-600"]).toBe("#7c3aed");
    expect(Object.keys(themeVariables(undefined))).toHaveLength(0);
  });
});
