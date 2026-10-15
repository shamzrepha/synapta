import { describe, it, expect } from "vitest";
import {
  G_EARTH, R_GAS, projectile, projectileIdeal, bestAngleIdeal, pendulumPeriod, pendulumPeriodSmall, ellipticK, simulatePendulum, measurePeriod, lengthForPeriod,
  titrationPH, equivalenceVolume, equivalencePH, titrationCurve, indicatorColor, bestIndicator, INDICATORS,
  gasPressure, gasVolume, gasTemperature, gasMoles, pistonVolume, rmsSpeed, isotherm,
} from "./physics";

describe("projectile", () => {
  it("matches the textbook range v²sin2θ/g from the ground, both ways", () => {
    const expected = (20 * 20 * Math.sin((2 * 30 * Math.PI) / 180)) / G_EARTH;
    expect(projectileIdeal(20, 30, 0).range).toBeCloseTo(expected, 6);
    expect(projectile(20, 30, 0, 0).range).toBeCloseTo(expected, 6);
  });
  it("45° gives the longest range from the ground and the best-angle formula agrees", () => {
    const r = (a: number) => projectile(25, a, 0).range;
    expect(r(45)).toBeGreaterThan(r(40));
    expect(r(45)).toBeGreaterThan(r(50));
    expect(bestAngleIdeal(25, 0)).toBeCloseTo(45, 6);
    expect(bestAngleIdeal(25, 10)).toBeLessThan(45);
    const best = bestAngleIdeal(25, 10);
    expect(projectile(25, best, 10).range).toBeGreaterThan(projectile(25, best + 3, 10).range);
    expect(projectile(25, best, 10).range).toBeGreaterThan(projectile(25, best - 3, 10).range);
  });
  it("height and flight time follow the kinematics", () => {
    const p = projectile(20, 90, 0);
    expect(p.maxHeight).toBeCloseTo(400 / (2 * G_EARTH), 4);
    expect(p.flightTime).toBeCloseTo((2 * 20) / G_EARTH, 4);
    expect(projectile(10, 0, 5).flightTime).toBeCloseTo(Math.sqrt((2 * 5) / G_EARTH), 4);
  });
  it("drag shortens the range and the apex, and slows the impact", () => {
    const ideal = projectile(30, 40, 0, 0);
    const drag = projectile(30, 40, 0, 0.02);
    expect(drag.range).toBeLessThan(ideal.range);
    expect(drag.maxHeight).toBeLessThan(ideal.maxHeight);
    expect(drag.impactSpeed).toBeLessThan(ideal.impactSpeed);
    expect(drag.points[0]).toEqual([0, 0]);
    expect(drag.points[drag.points.length - 1][1]).toBe(0);
  });
  it("a tiny drag converges to the ideal answer", () => {
    expect(projectile(20, 35, 2, 1e-7).range).toBeCloseTo(projectile(20, 35, 2, 0).range, 2);
  });
  it("with drag the best angle is below 45°", () => {
    let best = 0;
    let bestR = 0;
    for (let a = 20; a <= 60; a += 1) {
      const r = projectile(40, a, 0, 0.02).range;
      if (r > bestR) [best, bestR] = [a, r];
    }
    expect(best).toBeLessThan(45);
  });
});

describe("pendulum", () => {
  it("small-angle period is 2π√(L/g)", () => {
    expect(pendulumPeriodSmall(1)).toBeCloseTo(2.00641, 4);
    expect(pendulumPeriod(1, 0.1)).toBeCloseTo(pendulumPeriodSmall(1), 4);
  });
  it("elliptic K reference values", () => {
    expect(ellipticK(0)).toBeCloseTo(Math.PI / 2, 12);
    expect(ellipticK(Math.sin(Math.PI / 6))).toBeCloseTo(1.68575, 4); // K(k=sin 30°)
  });
  it("a larger swing takes longer (about 7.7 % at 60°, 18 % at 90°)", () => {
    const T0 = pendulumPeriodSmall(1);
    expect(pendulumPeriod(1, 60) / T0).toBeCloseTo(1.0732, 3);
    expect(pendulumPeriod(1, 90) / T0).toBeCloseTo(1.1803, 3);
    expect(pendulumPeriod(1, 150)).toBeGreaterThan(pendulumPeriod(1, 90));
  });
  it("T² is proportional to L", () => {
    expect(pendulumPeriod(2, 10) ** 2 / pendulumPeriod(1, 10) ** 2).toBeCloseTo(2, 3);
  });
  it("the numerical simulation measures the same period as the formula, small and large angle", () => {
    for (const [L, a] of [[1, 5], [0.5, 30], [1.5, 80], [1, 120]]) {
      const T = measurePeriod(simulatePendulum(L, a, G_EARTH, 14))!;
      expect(T / pendulumPeriod(L, a)).toBeCloseTo(1, 3);
    }
  });
  it("conserves energy (the amplitude returns)", () => {
    const run = simulatePendulum(1, 60, G_EARTH, 8);
    expect(Math.max(...run.theta)).toBeCloseTo((60 * Math.PI) / 180, 4);
  });
  it("lengthForPeriod inverts the small-angle formula", () => {
    expect(pendulumPeriodSmall(lengthForPeriod(2))).toBeCloseTo(2, 10);
    expect(lengthForPeriod(2)).toBeCloseTo(0.99362, 4);
  });
});

describe("titration", () => {
  const strong = { acidC: 0.1, acidV: 25, baseC: 0.1, Ka: null };
  const weak = { acidC: 0.1, acidV: 25, baseC: 0.1, Ka: 1.8e-5 };
  it("starts at pH 1 for 0.1 M strong acid, and is 7 at equivalence", () => {
    expect(titrationPH(strong, 0)).toBeCloseTo(1, 2);
    expect(equivalenceVolume(strong)).toBeCloseTo(25, 10);
    expect(equivalencePH(strong)).toBeCloseTo(7, 2);
  });
  it("strong acid reference points: 10 mL → 1.37, 24.9 mL → 3.70, 25.1 mL → 10.30", () => {
    expect(titrationPH(strong, 10)).toBeCloseTo(1.37, 2);
    expect(titrationPH(strong, 24.9)).toBeCloseTo(3.7, 1);
    expect(titrationPH(strong, 25.1)).toBeCloseTo(10.3, 1);
    expect(titrationPH(strong, 50)).toBeCloseTo(12.52, 1);
  });
  it("weak acid: starts near 2.88, pH = pKa at half equivalence, equivalence above 7 (~8.7)", () => {
    expect(titrationPH(weak, 0)).toBeCloseTo(2.88, 2);
    expect(titrationPH(weak, 12.5)).toBeCloseTo(-Math.log10(1.8e-5), 2);
    expect(equivalencePH(weak)).toBeGreaterThan(8.5);
    expect(equivalencePH(weak)).toBeLessThan(9);
  });
  it("the curve rises monotonically", () => {
    const c = titrationCurve(weak, 50);
    for (let i = 1; i < c.length; i++) expect(c[i][1]).toBeGreaterThanOrEqual(c[i - 1][1] - 1e-9);
  });
  it("a different base concentration moves the equivalence volume", () => {
    expect(equivalenceVolume({ ...strong, baseC: 0.2 })).toBeCloseTo(12.5, 10);
  });
  it("indicators: right colour either side of the range, and the right indicator for each acid", () => {
    const ph = INDICATORS.find((i) => i.id === "phenolphthalein")!;
    expect(indicatorColor(ph, 5)).toEqual(ph.acidColor);
    expect(indicatorColor(ph, 12)).toEqual(ph.baseColor);
    expect(bestIndicator(equivalencePH(weak)).id).toBe("phenolphthalein");
    expect(bestIndicator(equivalencePH(strong)).id).toBe("bromothymol-blue");
  });
});

describe("ideal gas", () => {
  it("1 mol at 273.15 K in 22.414 L is 101.325 kPa", () => {
    expect(gasPressure(1, 273.15, 0.022414) / 1000).toBeCloseTo(101.325, 1);
  });
  it("the four forms of PV = nRT are consistent", () => {
    const n = 0.05;
    const T = 300;
    const V = pistonVolume(0.005, 0.2); // 1 L
    const P = gasPressure(n, T, V);
    expect(V).toBeCloseTo(0.001, 12);
    expect(gasVolume(n, T, P)).toBeCloseTo(V, 12);
    expect(gasTemperature(n, V, P)).toBeCloseTo(T, 9);
    expect(gasMoles(P, V, T)).toBeCloseTo(n, 12);
    expect(P).toBeCloseTo(n * R_GAS * T / V, 6);
  });
  it("Boyle: halving the volume doubles the pressure; Gay-Lussac: pressure ∝ T", () => {
    expect(gasPressure(0.1, 300, 0.0005) / gasPressure(0.1, 300, 0.001)).toBeCloseTo(2, 10);
    expect(gasPressure(0.1, 600, 0.001) / gasPressure(0.1, 300, 0.001)).toBeCloseTo(2, 10);
  });
  it("molecules move faster when hotter (N₂ at 300 K ≈ 517 m/s)", () => {
    expect(rmsSpeed(300)).toBeCloseTo(517, 0);
    expect(rmsSpeed(600)).toBeGreaterThan(rmsSpeed(300));
  });
  it("the isotherm is a hyperbola: P·V constant", () => {
    const pts = isotherm(0.05, 300, 0.5, 2);
    const k = pts[0][0] * pts[0][1];
    for (const [v, p] of pts) expect(v * p).toBeCloseTo(k, 6);
  });
});
