import { describe, it, expect } from "vitest";
import { Netlist, evaluateOutputs } from "./netlist";
import { BoardRuntime, circuitReader } from "./runtime";
import { checkCircuit } from "./checker";
import { l298Drop, tb6612Drop, ttRpmAt } from "../parts/library";

const P = (id: string, type: string, props?: Record<string, string | number>) => ({ id, type, x: 0, y: 0, props });
const W = (from: string, to: string, i = Math.random()) => ({ id: `w${i}`, from, to });

function l298(extra: Array<[string, string]> = [], props: Record<string, number> = {}, grounded = true) {
  return {
    parts: [P("board", "board"), P("bat", "battery", { volts: 6 }), P("drv", "l298n", props), P("m", "dc_motor")],
    wires: [
      ...(grounded ? [W("bat.minus", "board.GND", 1)] : []),
      W("bat.plus", "drv.vs", 2),
      W("drv.gnd", "board.GND", 3),
      W("drv.v5", "board.5V", 4),
      W("drv.out1", "m.a", 5),
      W("drv.out2", "m.b", 6),
      ...extra.map(([a, b], i) => W(a, b, 10 + i)),
    ],
  };
}
function run(circuit: ReturnType<typeof l298>, code: string, ms = 50, inputs = { pressed: new Set<string>(), values: {} as Record<string, number> }) {
  const rt = new BoardRuntime(code, circuitReader(circuit, inputs));
  rt.advance(ms);
  expect(rt.error).toBeNull();
  return { out: evaluateOutputs(new Netlist(circuit, inputs.pressed), rt.pins), rt };
}

describe("datasheet numbers", () => {
  it("L298 drop follows ST's typical saturation points (2.55 V at 1 A, 3.7 V at 2 A)", () => {
    expect(l298Drop(1)).toBeCloseTo(2.55, 2);
    expect(l298Drop(2)).toBeCloseTo(3.7, 2);
    expect(tb6612Drop(1)).toBeCloseTo(0.5, 2);
    expect(tb6612Drop(0.3)).toBeCloseTo(0.15, 2);
  });
  it("TT motor curve passes through the Adafruit measurements", () => {
    expect(ttRpmAt(3)).toBeCloseTo(120, -1);
    expect(ttRpmAt(4.5)).toBeCloseTo(185, -1);
    expect(ttRpmAt(6)).toBeCloseTo(250, -1);
  });
});

describe("L298N module logic", () => {
  const code = (a: number, b: number) => `function setup(){pinMode(8,OUTPUT);pinMode(9,OUTPUT);digitalWrite(8,${a});digitalWrite(9,${b});}function loop(){}`;
  const wires: Array<[string, string]> = [["board.D8", "drv.in1"], ["board.D9", "drv.in2"]];

  it("H,L runs forward and gives the motor less than the battery (the bridge drops 1.8–3.2 V)", () => {
    const { out } = run(l298(wires), code(1, 0));
    expect(out.m.on).toBe(true);
    expect(out.m.volts!).toBeGreaterThan(2.8);
    expect(out.m.volts!).toBeLessThan(4.3);
    expect(out.m.direction).toBe(1);
  });
  it("L,H reverses", () => {
    const { out } = run(l298(wires), code(0, 1));
    expect(out.m.volts!).toBeLessThan(-2.8);
    expect(out.m.direction).toBe(-1);
  });
  it("equal inputs = fast motor stop (brake)", () => {
    const { out } = run(l298(wires), code(1, 1));
    expect(out.m.brake).toBe(true);
    expect(out.m.on).toBe(false);
  });
  it("Enable LOW (jumper removed, ENA unwired) = free running", () => {
    const { out } = run(l298(wires, { jumperEnA: 0 }), code(1, 0));
    expect(out.m.on).toBe(false);
    expect(out.m.volts ?? 0).toBe(0);
  });
  it("PWM on ENA scales the voltage", () => {
    const full = run(l298([...wires, ["board.D5", "drv.ena"]]), `${code(1, 0).replace("function loop(){}", "")}function loop(){analogWrite(5,255);}`).out.m.volts!;
    const half = run(l298([...wires, ["board.D5", "drv.ena"]]), `${code(1, 0).replace("function loop(){}", "")}function loop(){analogWrite(5,128);}`).out.m.volts!;
    expect(half / full).toBeCloseTo(0.5, 1);
  });
  it("without a common ground the driver has no supply, and the checker says so", () => {
    const c = l298(wires, {}, false);
    const { out } = run(c, code(1, 0));
    expect(out.m.on).toBe(false);
    expect(checkCircuit(c, code(1, 0)).some((i) => /GND/i.test(i.message))).toBe(true);
  });
});

describe("TB6612FNG logic", () => {
  const tb = (stby: boolean) => ({
    parts: [P("board", "board"), P("bat", "battery", { volts: 6 }), P("drv", "tb6612"), P("m", "dc_motor")],
    wires: [
      W("bat.minus", "board.GND", 1), W("bat.plus", "drv.vm", 2), W("drv.vcc", "board.5V", 3), W("drv.gnd", "board.GND", 4),
      W("board.D8", "drv.ain1", 5), W("board.D9", "drv.ain2", 6), W("board.5V", "drv.pwma", 7),
      W("drv.aout1", "m.a", 8), W("drv.aout2", "m.b", 9),
      ...(stby ? [W("board.5V", "drv.stby", 10)] : []),
    ],
  });
  const code = "function setup(){pinMode(8,OUTPUT);pinMode(9,OUTPUT);digitalWrite(8,1);digitalWrite(9,0);}function loop(){}";
  it("standby (STBY not pulled high) = no motion", () => {
    const { out } = run(tb(false) as never, code);
    expect(out.m.on).toBe(false);
  });
  it("CW with STBY high gives nearly the full battery voltage (MOSFETs drop ~0.15 V)", () => {
    const { out } = run(tb(true) as never, code);
    expect(out.m.volts!).toBeGreaterThan(5.5);
    expect(out.m.volts!).toBeLessThan(6);
  });
});

describe("HC-SR04 ultrasonic", () => {
  const circuit = {
    parts: [P("board", "board"), P("us", "hc_sr04")],
    wires: [W("us.vcc", "board.5V", 1), W("us.gnd", "board.GND", 2), W("us.trig", "board.D9", 3), W("us.echo", "board.D10", 4)],
  };
  const read = `
    function setup(){pinMode(9,OUTPUT);pinMode(10,INPUT);Serial.begin(9600);}
    function loop(){
      digitalWrite(9,LOW);delayMicroseconds(2);
      digitalWrite(9,HIGH);delayMicroseconds(10);digitalWrite(9,LOW);
      var us=pulseIn(10,HIGH);
      Serial.println(us);
      delay(100);
    }`;
  it("returns echo µs = cm × 58 after a 10 µs trigger", () => {
    const inputs = { pressed: new Set<string>(), values: { us: 30 } as Record<string, number> };
    const { rt } = run(circuit as never, read, 400, inputs);
    expect(rt.serial.length).toBeGreaterThan(1);
    expect(Number(rt.serial[0].text)).toBe(30 * 58);
  });
  it("no trigger pulse, no echo; out of range, no echo; unpowered, no echo", () => {
    const noTrig = "function setup(){pinMode(10,INPUT);}function loop(){Serial.println(pulseIn(10,HIGH));delay(100);}";
    expect(Number(run(circuit as never, noTrig, 300, { pressed: new Set(), values: { us: 30 } }).rt.serial[0].text)).toBe(0);
    expect(Number(run(circuit as never, read, 300, { pressed: new Set(), values: { us: 500 } }).rt.serial[0].text)).toBe(0);
    const dead = { ...circuit, wires: circuit.wires.filter((w) => !w.from.startsWith("us.vcc")) };
    expect(Number(run(dead as never, read, 300, { pressed: new Set(), values: { us: 30 } }).rt.serial[0].text)).toBe(0);
  });
});

import { PART_USAGE } from "../parts/usage";
import { shopItems, promptPack } from "../parts/shop";
import { CATALOG } from "./catalog";

describe("shop and grounding", () => {
  it("every catalog part is in the shop with usage notes", () => {
    const items = shopItems();
    expect(items.map((i) => i.type).sort()).toEqual(CATALOG.map((c) => c.type).sort());
    for (const i of items) expect(PART_USAGE[i.type], i.type).toBeDefined();
  });
  it("every working-code snippet in the shop runs in the simulator without errors", () => {
    for (const [type, u] of Object.entries(PART_USAGE)) {
      if (!u.code) continue;
      const rt = new BoardRuntime(u.code, () => 0);
      rt.advance(300);
      expect(rt.error, type).toBeNull();
    }
  });
  it("the grounding snippet carries the datasheet truth table and facts for selected parts", () => {
    const pack = promptPack(["l298n", "hc_sr04"]);
    expect(pack).toContain("DATASHEET-VERIFIED");
    expect(pack).toContain("Fast motor stop");
    expect(pack).toContain("µs / 58");
    expect(pack).toContain("1.35 V typ");
  });
});

import { enforceParts, cleanSelection } from "../ai-build";
describe("constrained builds", () => {
  it("removes circuit parts that were not selected and their wires", () => {
    const raw = { circuit: { parts: [{ id: "board", type: "board" }, { id: "x", type: "servo" }, { id: "d", type: "l298n" }], wires: [{ from: "board.D9", to: "x.signal" }, { from: "board.D7", to: "d.in1" }] } };
    const { spec, removed } = enforceParts(raw, ["l298n"]);
    expect(removed).toEqual(["x (servo)"]);
    const c = spec.circuit as { parts: unknown[]; wires: unknown[] };
    expect(c.parts).toHaveLength(2);
    expect(c.wires).toHaveLength(1);
  });
  it("drops unknown shop parts and merges quantities", () => {
    expect(cleanSelection([{ type: "l298n", qty: 1 }, { type: "l298n", qty: 2 }, { type: "flux_capacitor", qty: 1 }])).toEqual([{ type: "l298n", qty: 3 }]);
  });
});
