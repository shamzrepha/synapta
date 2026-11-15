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

describe("Interactive Science Lab Workbench Engine", () => {
  it("precipitates sky-blue Cu(OH)2 at room temperature and dehydrates to black CuO when heated in fire", () => {
    const cold = evaluateWorkbench({ ...baseState, reagents: ["cuso4", "naoh"], microscopeSlideTaken: true });
    expect(cold.precipitate.present).toBe(true);
    expect(cold.precipitate.formula).toBe("Cu(OH)₂(s)");
    expect(LAB_VERIFICATION_ORDERS[0].verify({ ...baseState, reagents: ["cuso4", "naoh"], microscopeSlideTaken: true }, cold).passed).toBe(true);

    const heated = evaluateWorkbench({
      ...baseState,
      reagents: ["cuso4", "naoh"],
      burner: "roaring",
      heatingSeconds: 5,
    });
    expect(heated.temperatureC).toBeGreaterThanOrEqual(80);
    expect(heated.precipitate.formula).toBe("CuO(s)");
    expect(LAB_VERIFICATION_ORDERS[1].verify({ ...baseState, reagents: ["cuso4", "naoh"], burner: "roaring", heatingSeconds: 5 }, heated).passed).toBe(true);
  });

  it("detects AgCl curdy white precipitate and verifies under 400x microscope", () => {
    const state: VesselState = {
      ...baseState,
      reagents: ["hcl", "agno3"],
      microscopeSlideTaken: true,
      microscopeZoom: 400,
    };
    const res = evaluateWorkbench(state);
    expect(res.precipitate.formula).toBe("AgCl(s)");
    expect(LAB_VERIFICATION_ORDERS[2].verify(state, res).passed).toBe(true);
  });

  it("simulates CO2 effervescence and 622nm Brick-Red Ca2+ flame test", () => {
    const state: VesselState = {
      ...baseState,
      reagents: ["caco3", "hcl"],
      burner: "roaring",
      flameLoopActive: true,
    };
    const res = evaluateWorkbench(state);
    expect(res.gasEvolved.present).toBe(true);
    expect(res.gasEvolved.formula).toBe("CO₂(g)");
    expect(res.flameTest.active).toBe(true);
    expect(res.flameTest.wavelengthNm).toBe(622);
    expect(LAB_VERIFICATION_ORDERS[3].verify(state, res).passed).toBe(true);
  });

  it("stains onion starch cells blue-black with Lugol's iodine", () => {
    const state: VesselState = {
      ...baseState,
      reagents: ["starch_cells", "iodine"],
      microscopeSlideTaken: true,
    };
    const res = evaluateWorkbench(state);
    expect(res.precipitate.formula).toBe("Amylose–I₅⁻");
    expect(LAB_VERIFICATION_ORDERS[4].verify(state, res).passed).toBe(true);
  });
});
