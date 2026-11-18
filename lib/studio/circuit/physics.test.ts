import { describe, it, expect } from "vitest";
import { Netlist, emptyPinState, evaluateOutputs } from "./netlist";
import { checkCircuit, liveFaultIssues } from "./checker";
import type { CircuitPart, Wire } from "../spec";

const P = (id: string, type: string, props?: Record<string, string | number>): CircuitPart => ({ id, type, x: 0, y: 0, props });
const W = (from: string, to: string): Wire => ({ id: `${from}-${to}`, from, to });
const run = (c: { parts: CircuitPart[]; wires: Wire[] }, pressed: string[] = []) => evaluateOutputs(new Netlist(c, new Set(pressed)), emptyPinState());
const errors = (c: { parts: CircuitPart[]; wires: Wire[] }) => checkCircuit(c, "").filter((i) => i.severity === "error");

describe("studio physics judgement (battery circuits)", () => {
  it("LED + 220 ohm on 6 V is fine and reports ~18 mA", () => {
    const c = { parts: [P("b", "battery", { volts: 6 }), P("r", "resistor", { ohms: 220 }), P("l", "led")], wires: [W("b.plus", "r.a"), W("r.b", "l.anode"), W("l.cathode", "b.minus")] };
    const o = run(c);
    expect(o.l.on).toBe(true);
    expect(o.l.fault).toBeUndefined();
    expect(o.l.currentMa!).toBeGreaterThan(15);
    expect(o.l.currentMa!).toBeLessThan(20);
    expect(errors(c)).toEqual([]);
  });

  it("LED + 220 ohm on 12 V exceeds 20 mA and says the numbers", () => {
    const c = { parts: [P("b", "battery", { volts: 12 }), P("r", "resistor", { ohms: 220 }), P("l", "led")], wires: [W("b.plus", "r.a"), W("r.b", "l.anode"), W("l.cathode", "b.minus")] };
    const o = run(c);
    expect(o.l.fault).toBe("overcurrent");
    expect(o.l.currentMa!).toBeGreaterThan(40);
    const e = errors(c).find((i) => /mA/.test(i.message));
    expect(e?.message).toMatch(/\d+ mA.*20 mA/);
  });

  it("LED with no resistor reports current and limit", () => {
    const c = { parts: [P("b", "battery", { volts: 6 }), P("l", "led")], wires: [W("b.plus", "l.anode"), W("l.cathode", "b.minus")] };
    const o = run(c);
    expect(o.l.fault).toBe("overcurrent");
    expect(o.l.currentMa!).toBeGreaterThan(100);
    expect(errors(c)[0].message).toMatch(/\d+ mA.*20 mA/);
  });

  it("reversed LED stays dark, carries no current and is explained", () => {
    const c = { parts: [P("b", "battery", { volts: 6 }), P("r", "resistor"), P("l", "led")], wires: [W("b.plus", "r.a"), W("r.b", "l.cathode"), W("l.anode", "b.minus")] };
    const o = run(c);
    expect(o.l.on).toBe(false);
    expect(o.l.fault).toBe("reversed");
    expect(Math.abs(o.l.currentMa ?? 0)).toBeLessThan(1);
    expect(errors(c).some((i) => /backwards/.test(i.message))).toBe(true);
  });

  it("a bare wire across the battery is a short circuit", () => {
    const c = { parts: [P("b", "battery", { volts: 6 })], wires: [W("b.plus", "b.minus")] };
    const o = run(c);
    expect(o.b.fault).toBe("short");
    expect(errors(c).some((i) => /short/i.test(i.message) && /mA|\bA\b/.test(i.message))).toBe(true);
  });

  it("a closed switch straight across the supply is a short, an open one is not", () => {
    const c = { parts: [P("b", "battery", { volts: 6 }), P("s", "switch")], wires: [W("b.plus", "s.a"), W("s.b", "b.minus")] };
    expect(run(c).b.fault).toBeUndefined();
    expect(run(c, ["s"]).b.fault).toBe("short");
  });

  it("an open loop carries zero current", () => {
    const c = { parts: [P("b", "battery"), P("a", "ammeter"), P("l", "bulb")], wires: [W("b.plus", "a.in"), W("a.out", "l.a")] };
    const o = run(c);
    expect(Math.abs(o.a.currentMa ?? 0)).toBeLessThan(0.5);
    expect(o.l.on).toBe(false);
  });

  it("series resistors add, parallel resistors share", () => {
    const series = { parts: [P("b", "battery", { volts: 6 }), P("a", "ammeter"), P("r1", "resistor", { ohms: 100 }), P("r2", "resistor", { ohms: 200 })], wires: [W("b.plus", "a.in"), W("a.out", "r1.a"), W("r1.b", "r2.a"), W("r2.b", "b.minus")] };
    expect(run(series).a.currentMa!).toBeGreaterThan(19);
    expect(run(series).a.currentMa!).toBeLessThan(20.5);
    const par = { parts: [P("b", "battery", { volts: 6 }), P("a", "ammeter"), P("r1", "resistor", { ohms: 100 }), P("r2", "resistor", { ohms: 100 })], wires: [W("b.plus", "a.in"), W("a.out", "r1.a"), W("a.out", "r2.a"), W("r1.b", "b.minus"), W("r2.b", "b.minus")] };
    expect(run(par).a.currentMa!).toBeGreaterThan(118);
    expect(run(par).a.currentMa!).toBeLessThan(121);
  });

  it("an ammeter in parallel across a resistor is reported as wrong", () => {
    const c = { parts: [P("b", "battery", { volts: 6 }), P("r", "resistor", { ohms: 100 }), P("a", "ammeter")], wires: [W("b.plus", "r.a"), W("r.b", "b.minus"), W("a.in", "r.a"), W("a.out", "r.b")] };
    const e = errors(c).find((i) => /ammeter/i.test(i.message));
    expect(e).toBeTruthy();
    expect(e!.message).toMatch(/parallel/i);
  });

  it("a voltmeter in series blocks the loop and is reported", () => {
    const c = { parts: [P("b", "battery", { volts: 6 }), P("v", "voltmeter"), P("l", "bulb")], wires: [W("b.plus", "v.plus"), W("v.minus", "l.a"), W("l.b", "b.minus")] };
    const o = run(c);
    expect(o.l.on).toBe(false);
    const issues = checkCircuit(c, "").filter((i) => /voltmeter/i.test(i.message));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toMatch(/series/i);
  });

  it("a bulb on too much voltage burns out with numbers", () => {
    const c = { parts: [P("b", "battery", { volts: 12 }), P("l", "bulb", { ohms: 12, maxVolts: 9 })], wires: [W("b.plus", "l.a"), W("l.b", "b.minus")] };
    expect(run(c).l.fault).toBe("overvoltage");
    expect(checkCircuit(c, "").some((i) => /12/.test(i.message) && /9 V/.test(i.message))).toBe(true);
  });

  it("live faults appear only once a switch closes the short", () => {
    const c = { parts: [P("b", "battery", { volts: 6 }), P("s", "switch")], wires: [W("b.plus", "s.a"), W("s.b", "b.minus")] };
    expect(liveFaultIssues(c, run(c))).toEqual([]);
    const live = liveFaultIssues(c, run(c, ["s"]));
    expect(live[0].message).toMatch(/short circuit.*A/i);
  });
});
