import { describe, it, expect } from "vitest";
import { evaluateWorkbench, LAB_VERIFICATION_ORDERS, type VesselState } from "./workbench";

const baseState: VesselState = {
  reagents: [],
  burner: "off",
  heatingSeconds: 0,
  flameLoopActive: false,
  microscopeSlideTaken: false,
  microscopeZoom: 100,
};

const ev = (reagents: VesselState["reagents"], extra: Partial<VesselState> = {}) =>
  evaluateWorkbench({ ...baseState, reagents, ...extra });

describe("Workbench reaction rules are chemically correct", () => {
  it("Fe(OH)2 from FeSO4 + NaOH, Fe(OH)3 from FeCl3 + NaOH", () => {
    expect(ev(["feso4", "naoh"]).precipitate.formula).toBe("Fe(OH)₂(s)");
    expect(ev(["fecl3", "naoh"]).precipitate.formula).toBe("Fe(OH)₃(s)");
  });
  it("AgCl from AgNO3 with any chloride, but not with sulfate", () => {
    for (const cl of ["hcl", "bacl2", "fecl3"] as const) expect(ev(["agno3", cl]).precipitate.formula).toBe("AgCl(s)");
    expect(ev(["agno3", "cuso4"]).precipitate.present).toBe(false);
  });
  it("AgNO3 + NaOH gives brown Ag2O, not a silent clear solution", () => {
    expect(ev(["agno3", "naoh"]).precipitate.formula).toBe("Ag₂O(s)");
  });
  it("BaSO4 from BaCl2 + sulfate", () => {
    expect(ev(["bacl2", "cuso4"]).precipitate.formula).toBe("BaSO₄(s)");
    expect(ev(["bacl2", "feso4"]).precipitate.formula).toBe("BaSO₄(s)");
  });
  it("CaCO3 + HCl fizzes CO2 at room temperature", () => {
    const r = ev(["caco3", "hcl"]);
    expect(r.gasEvolved.formula).toBe("CO₂(g)");
    expect(r.temperatureC).toBe(25);
  });
  it("HCl + NaOH is exothermic; pH follows the excess; no precipitate", () => {
    const eq = ev(["hcl", "naoh"]);
    expect(eq.temperatureC).toBeGreaterThan(25);
    expect(eq.pH).toBe(7);
    expect(ev(["hcl", "hcl", "naoh"]).pH).toBeLessThan(7);
    expect(ev(["hcl", "naoh", "naoh"]).pH).toBeGreaterThan(8.2);
    expect(eq.precipitate.present).toBe(false);
  });
  it("phenolphthalein is pink only in alkali", () => {
    expect(ev(["naoh", "phenolphthalein"]).liquidColorHex).toBe("#ec4899");
    expect(ev(["hcl", "phenolphthalein"]).liquidColorHex).not.toBe("#ec4899");
    expect(ev(["hcl", "naoh", "phenolphthalein"]).liquidColorHex).not.toBe("#ec4899");
    expect(ev(["hcl", "naoh", "naoh", "phenolphthalein"]).liquidColorHex).toBe("#ec4899");
  });
  it("acid at least equal to the alkali dissolves the metal hydroxide, so no Cu(OH)2 is shown", () => {
    expect(ev(["cuso4", "hcl", "hcl", "naoh"]).precipitate.present).toBe(false);
    expect(ev(["cuso4", "hcl", "naoh"]).precipitate.present).toBe(false);
    expect(ev(["cuso4", "hcl", "naoh", "naoh"]).precipitate.formula).toBe("Cu(OH)₂(s)");
  });
  it("an aqueous vessel cannot go above 100C", () => {
    const r = ev(["cuso4", "naoh"], { burner: "roaring", heatingSeconds: 60 });
    expect(r.temperatureC).toBeLessThanOrEqual(100);
    expect(r.precipitate.formula).toBe("CuO(s)");
  });
  it("CaCO3 only calcines at furnace temperatures, not at 200C", () => {
    const warm = ev(["caco3"], { burner: "roaring", heatingSeconds: 10 });
    expect(warm.precipitate.present).toBe(false);
    const hot = ev(["caco3"], { burner: "roaring", heatingSeconds: 60 });
    expect(hot.precipitate.formula).toBe("CaO(s)");
    expect(hot.gasEvolved.formula).toBe("CO₂(g)");
  });
  it("Lugol's iodine alone does not stain; starch needs both", () => {
    expect(ev(["iodine"]).precipitate.present).toBe(false);
    expect(ev(["starch_cells"]).precipitate.present).toBe(false);
  });
  it("flame colours: Ca brick red, Cu blue-green, Ba green, Na yellow and masks the others", () => {
    const f = (r: VesselState["reagents"]) => ev(r, { burner: "safety", flameLoopActive: true }).flameTest;
    expect(f(["caco3"]).wavelengthNm).toBe(622);
    expect(f(["cuso4"]).label).toMatch(/Cu/);
    expect(f(["bacl2"]).label).toMatch(/Ba/);
    expect(f(["naoh"]).wavelengthNm).toBe(589);
    expect(f(["caco3", "naoh"]).wavelengthNm).toBe(589);
    expect(f(["fecl3", "caco3"]).wavelengthNm).toBe(622);
    expect(f(["hcl"]).label).toMatch(/Clean/);
    expect(ev(["caco3"], { flameLoopActive: true }).flameTest.active).toBe(false);
  });
  it("orders cannot be passed without doing the work", () => {
    for (const o of LAB_VERIFICATION_ORDERS) {
      expect(o.verify(baseState, evaluateWorkbench(baseState)).passed).toBe(false);
    }
    const s: VesselState = { ...baseState, reagents: ["caco3"], burner: "safety", flameLoopActive: true };
    expect(LAB_VERIFICATION_ORDERS[3].verify(s, evaluateWorkbench(s)).passed).toBe(false);
    const n: VesselState = { ...baseState, reagents: ["hcl", "naoh", "phenolphthalein"] };
    expect(LAB_VERIFICATION_ORDERS[5].verify(n, evaluateWorkbench(n)).passed).toBe(false);
    const ok: VesselState = { ...baseState, reagents: ["hcl", "naoh", "naoh", "phenolphthalein"] };
    expect(LAB_VERIFICATION_ORDERS[5].verify(ok, evaluateWorkbench(ok)).passed).toBe(true);
  });
});
