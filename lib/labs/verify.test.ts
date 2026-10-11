import { describe, it, expect } from "vitest";
import {
  verifyOhmsLaw,
  verifyRcFilter,
  verifyProjectile,
  verifyLogicGates,
  verifyLab,
} from "./verify";

describe("Lab Verification Engine", () => {
  describe("Ohm's Law Verification", () => {
    it("accepts valid voltage and resistance matching target current and power", () => {
      // 12V / 100 ohms = 0.12 A (120 mA), P = (0.12)^2 * 100 = 1.44 W <= 1.5 W
      const result = verifyOhmsLaw({
        voltage: 12,
        resistance: 100,
        targetCurrent: 0.12,
        maxPower: 1.5,
      });
      expect(result.success).toBe(true);
    });

    it("rejects parameters when current is outside tolerance", () => {
      // 20V / 100 ohms = 0.20 A (diff from 0.12 is 0.08 > 0.015)
      const result = verifyOhmsLaw({
        voltage: 20,
        resistance: 100,
        targetCurrent: 0.12,
        maxPower: 10,
      });
      expect(result.success).toBe(false);
    });

    it("rejects parameters when power dissipation exceeds max safe power", () => {
      // 1.2V / 10 ohms = 0.12 A, P = (0.12)^2 * 10 = 0.144 W <= 0.1 W (fails)
      const result = verifyOhmsLaw({
        voltage: 1.2,
        resistance: 10,
        targetCurrent: 0.12,
        maxPower: 0.1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("RC Low-Pass Filter Verification", () => {
    it("accepts component values tuning cutoff frequency within 5%", () => {
      // fc = 1 / (2 * pi * 1000 * 0.16e-6) ~= 994.7 Hz (target 1000 Hz, error ~0.5% <= 5%)
      const result = verifyRcFilter({
        resistance: 1000,
        capacitanceMicro: 0.16,
        targetCutoff: 1000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects component values with large frequency error", () => {
      const result = verifyRcFilter({
        resistance: 1000,
        capacitanceMicro: 1.0, // fc = ~159 Hz vs 1000 Hz
        targetCutoff: 1000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Projectile Motion Verification", () => {
    it("accepts launch parameters landing within target tolerance", () => {
      // Range = (35^2 * sin(90°)) / 9.8 = 1225 / 9.8 = 125 m (target 120 ± 6 m)
      const result = verifyProjectile({
        angle: 45,
        speed: 35,
        targetDistance: 120,
        tolerance: 6,
      });
      expect(result.success).toBe(true);
    });

    it("rejects launch parameters missing target", () => {
      // angle 10 degrees => Range is much smaller
      const result = verifyProjectile({
        angle: 10,
        speed: 35,
        targetDistance: 120,
        tolerance: 6,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Logic Gates Half Adder Verification", () => {
    it("accepts when all 4 input combinations are validated", () => {
      const result = verifyLogicGates({
        testedCombinations: ["0_0", "0_1", "1_0", "1_1"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects when fewer than 4 input combinations are validated", () => {
      const result = verifyLogicGates({
        testedCombinations: ["0_0", "0_1"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("verifyLab dispatcher", () => {
    it("dispatches ohms_law correctly", () => {
      const result = verifyLab("ohms_law", { voltage: 12, resistance: 100 });
      expect(result.success).toBe(true);
    });

    it("returns failure for unknown lab types", () => {
      const result = verifyLab("unknown_lab", {});
      expect(result.success).toBe(false);
    });
  });
});
