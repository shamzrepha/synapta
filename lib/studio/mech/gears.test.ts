import { describe, it, expect } from "vitest";
import { analyzeMechanism, simulateLift, gearLayout, G } from "./gears";
import { mechanismSchema } from "../spec";

const mech = (stages: Array<[number, number]>, mass = 2, extra: Record<string, unknown> = {}) =>
  mechanismSchema.parse({
    input: { kind: "motor", stallTorque: 0.05, freeRpm: 6000 },
    stages: stages.map(([driverTeeth, drivenTeeth]) => ({ driverTeeth, drivenTeeth })),
    drumRadius: 0.01,
    load: { mass },
    liftHeight: 1,
    ...extra,
  });

describe("gear train analysis", () => {
  it("multiplies stage ratios and loses efficiency per stage", () => {
    const a = analyzeMechanism(mech([[12, 36], [10, 40]]));
    expect(a.ratio).toBeCloseTo(12);
    expect(a.efficiency).toBeCloseTo(0.95 ** 2);
  });

  it("knows when the input is too weak to hold the load", () => {
    // direct drive: needs m·g·r = 2·9.81·0.01 ≈ 0.196 N·m, motor gives 0.05
    const weak = analyzeMechanism(mech([[20, 20]]));
    expect(weak.canLift).toBe(false);
    expect(weak.holdTorque).toBeCloseTo((2 * G * 0.01) / 0.95, 3);
    expect(analyzeMechanism(mech([[12, 60]])).canLift).toBe(true);
  });

  it("lays out meshing gears at the right centre distance with alternating direction", () => {
    const g = gearLayout(mech([[12, 36]]));
    expect(g[1].x - g[0].x).toBeCloseTo((2 * (12 + 36)) / 2);
    expect(g[0].direction).toBe(-g[1].direction);
    expect(g[1].speedFactor).toBeCloseTo(1 / 3);
  });

  it("crank: reports the push force needed", () => {
    const m = mechanismSchema.parse({ input: { kind: "crank", force: 30, crankRadius: 0.1 }, stages: [{ driverTeeth: 12, drivenTeeth: 48 }], drumRadius: 0.02, load: { mass: 20 } });
    const a = analyzeMechanism(m);
    expect(a.holdForce).toBeCloseTo((20 * G * 0.02) / (4 * 0.95) / 0.1, 2);
    expect(a.canLift).toBe(a.holdForce! < 30);
  });
});

describe("lift simulation with gravity", () => {
  it("fails without enough reduction and reports why", () => {
    const r = simulateLift(mech([[20, 20]]));
    expect(r.reached).toBe(false);
    expect(r.score).toBe(0);
    expect(r.verdict).toMatch(/Can't lift/);
  });

  it("lifts with reduction; the ratio near the optimum beats too much reduction", () => {
    const opt = analyzeMechanism(mech([[12, 60]])).optimalRatio; // ≈ 2mg·r/(τη) ≈ 8.3
    expect(opt).toBeGreaterThan(5);
    expect(opt).toBeLessThan(12);
    const near = simulateLift(mech([[12, 36], [12, 36]])); // 9:1
    const heavy = simulateLift(mech([[12, 60], [12, 60]])); // 25:1
    expect(near.reached && heavy.reached).toBe(true);
    expect(near.timeToLift!).toBeLessThan(heavy.timeToLift!);
    expect(near.score).toBeGreaterThan(heavy.score);
    // steady speed from the simulation matches the analytic value
    expect(near.maxSpeed).toBeCloseTo(near.steadySpeed, 1);
  });

  it("pulleys trade speed for force like extra gearing", () => {
    const one = analyzeMechanism(mech([[12, 24]], 4));
    const two = analyzeMechanism(mech([[12, 24]], 4, { pulleyAdvantage: 2 }));
    expect(two.holdTorque).toBeLessThan(one.holdTorque);
  });

  it("is deterministic (same design → same score) for fair challenges", () => {
    expect(simulateLift(mech([[12, 48]])).timeToLift).toBe(simulateLift(mech([[12, 48]])).timeToLift);
  });
});
