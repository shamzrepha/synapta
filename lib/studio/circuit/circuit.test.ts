import { describe, it, expect } from "vitest";
import { Netlist, emptyPinState, evaluateOutputs, readPin, scanCode } from "./netlist";
import { checkCircuit, nextGaps } from "./checker";
import { BoardRuntime, circuitReader, runBehaviorTest, toEs5 } from "./runtime";
import type { CircuitPart, Wire } from "../spec";

const P = (id: string, type: string, props?: Record<string, string | number>): CircuitPart => ({ id, type, x: 0, y: 0, props });
const W = (from: string, to: string): Wire => ({ id: `${from}-${to}`, from, to });

const trafficCircuit = {
  parts: [P("board", "board"), P("red", "led", { color: "red" }), P("amber", "led", { color: "amber" }), P("green", "led", { color: "green" }), P("r1", "resistor"), P("r2", "resistor"), P("r3", "resistor")],
  wires: [
    W("board.D13", "r1.a"), W("r1.b", "red.anode"), W("red.cathode", "board.GND"),
    W("board.D12", "r2.a"), W("r2.b", "amber.anode"), W("amber.cathode", "board.GND"),
    W("board.D11", "r3.a"), W("r3.b", "green.anode"), W("green.cathode", "board.GND2"),
  ],
};

const trafficCode = `const RED = 13;
let AMBER = 12;
var GREEN = 11;

function setup() {
  pinMode(RED, OUTPUT);
  pinMode(AMBER, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

function light(r, a, g, ms) {
  digitalWrite(RED, r);
  digitalWrite(AMBER, a);
  digitalWrite(GREEN, g);
  delay(ms);
}

function loop() {
  light(HIGH, LOW, LOW, 5000);
  light(LOW, LOW, HIGH, 4000);
  light(LOW, HIGH, LOW, 1500);
}
`;

describe("circuit nets and electrical model", () => {
  it("lights an LED driven HIGH through a resistor and not when LOW", () => {
    const nl = new Netlist(trafficCircuit);
    const pins = emptyPinState();
    pins.mode[13] = "OUTPUT";
    pins.level[13] = 1;
    const out = evaluateOutputs(nl, pins);
    expect(out.red.on).toBe(true);
    expect(out.red.fault).toBeUndefined();
    expect(out.green.on).toBe(false);
  });

  it("flags an LED wired without a resistor and one wired backwards", () => {
    const circuit = {
      parts: [P("board", "board"), P("a", "led"), P("b", "led")],
      wires: [W("board.D13", "a.anode"), W("a.cathode", "board.GND"), W("board.5V", "b.cathode"), W("b.anode", "board.GND")],
    };
    const issues = checkCircuit(circuit, "function setup(){pinMode(13, OUTPUT)}function loop(){digitalWrite(13, HIGH)}");
    expect(issues.some((i) => i.severity === "error" && /no resistor/.test(i.message))).toBe(true);
    expect(issues.some((i) => /reversed/.test(i.message))).toBe(true);
    const pins = emptyPinState();
    pins.mode[13] = "OUTPUT";
    pins.level[13] = 1;
    const out = evaluateOutputs(new Netlist(circuit), pins);
    expect(out.a.fault).toBe("overcurrent");
    expect(out.b.on).toBe(false);
    expect(out.b.fault).toBe("reversed");
  });

  it("reads a button with INPUT_PULLUP: HIGH released, LOW pressed", () => {
    const circuit = { parts: [P("board", "board"), P("btn", "button")], wires: [W("board.D2", "btn.a"), W("btn.b", "board.GND")] };
    const pins = emptyPinState();
    pins.mode[2] = "INPUT_PULLUP";
    expect(readPin(new Netlist(circuit), pins, 2, false)).toBe(1);
    expect(readPin(new Netlist(circuit, new Set(["btn"])), pins, 2, false)).toBe(0);
  });

  it("reads a powered potentiometer on A0 and 0 when unpowered", () => {
    const pot = P("pot", "potentiometer", { value: 700 });
    const wired = { parts: [P("board", "board"), pot], wires: [W("board.5V", "pot.vcc"), W("pot.gnd", "board.GND"), W("pot.wiper", "board.A0")] };
    expect(readPin(new Netlist(wired), emptyPinState(), 14, true)).toBe(700);
    const unpowered = { ...wired, wires: [W("pot.wiper", "board.A0")] };
    expect(readPin(new Netlist(unpowered), emptyPinState(), 14, true)).toBe(0);
  });

  it("warns that a motor on a pin needs a driver", () => {
    const circuit = { parts: [P("board", "board"), P("m", "dc_motor")], wires: [W("board.D9", "m.a"), W("m.b", "board.GND")] };
    expect(checkCircuit(circuit, "").some((i) => /needs?|driver|rated for ~20 mA/.test(i.message + i.prompt))).toBe(true);
  });

  it("scans code for pins, resolving named constants", () => {
    const s = scanCode(trafficCode);
    expect(Array.from(s.writes).sort()).toEqual([11, 12, 13]);
    expect(s.modes.get(13)).toBe("OUTPUT");
    expect(s.hasLoop && s.hasSetup && s.hasDelay).toBe(true);
  });

  it("a correct traffic light has no errors and no open gaps", () => {
    expect(checkCircuit(trafficCircuit, trafficCode).filter((i) => i.severity !== "info")).toEqual([]);
    expect(nextGaps(trafficCircuit, trafficCode)).toEqual([]);
  });
});

describe("sandboxed board runtime", () => {
  it("rewrites let/const outside strings and comments", () => {
    expect(toEs5("const a = 1; // let b\nlet c = 'const';")).toBe("var a = 1; // let b\nvar c = 'const';");
  });

  it("runs setup/loop with delay on a virtual clock", () => {
    const rt = new BoardRuntime(trafficCode, circuitReader(trafficCircuit, { pressed: new Set(), values: {} }));
    rt.advance(100);
    expect(rt.pins.level[13]).toBe(1);
    rt.advance(6000);
    expect(rt.pins.level[13]).toBe(0);
    expect(rt.pins.level[11]).toBe(1);
    rt.advance(9500);
    expect(rt.pins.level[12]).toBe(1);
    expect(rt.error).toBeNull();
  });

  it("reports syntax and runtime errors with the user's line number", () => {
    const bad = new BoardRuntime("function setup() {\n  pinMode(13 OUTPUT);\n}\nfunction loop(){}", () => 0);
    expect(bad.error).toMatch(/^Line 2:/);
    const boom = new BoardRuntime("function setup(){}\nfunction loop(){ undefinedThing(); }", () => 0);
    boom.advance(10);
    expect(boom.error).toMatch(/undefinedThing/);
  });

  it("can't reach the outside world", () => {
    const rt = new BoardRuntime("function setup(){ Serial.println(typeof document + ',' + typeof fetch + ',' + typeof require + ',' + typeof XMLHttpRequest); }\nfunction loop(){ delay(1000); }", () => 0);
    rt.advance(5);
    expect(rt.serial.map((s) => s.text).join("")).toBe("undefined,undefined,undefined,undefined\n");
  });

  it("keeps the clock moving in a busy loop without delay", () => {
    const rt = new BoardRuntime("var n=0; function setup(){} function loop(){ n++; }", () => 0);
    rt.advance(50, 50_000);
    expect(rt.now).toBeGreaterThan(0);
    expect(rt.error).toBeNull();
  });
});

describe("behaviour tests", () => {
  it("passes the traffic-light sequence and fails when the order is wrong", () => {
    const test = {
      id: "seq",
      title: "Red → green → amber, twice",
      durationMs: 22_000,
      inputs: [],
      expect: { kind: "sequence" as const, parts: ["red", "amber", "green"], states: [[1, 0, 0], [0, 0, 1], [0, 1, 0]] as (0 | 1)[][], minMs: 500, cycles: 2 },
    };
    expect(runBehaviorTest(trafficCircuit, trafficCode, test).pass).toBe(true);
    const wrong = trafficCode.replace("light(LOW, LOW, HIGH, 4000);", "light(LOW, HIGH, LOW, 4000);").replace("light(LOW, HIGH, LOW, 1500);", "light(LOW, LOW, HIGH, 1500);");
    const r = runBehaviorTest(trafficCircuit, wrong, test);
    expect(r.pass).toBe(false);
    expect(r.message).toMatch(/Expected/);
  });

  it("drives button inputs over time", () => {
    const circuit = {
      parts: [P("board", "board"), P("btn", "button"), P("led", "led"), P("r", "resistor")],
      wires: [W("board.D2", "btn.a"), W("btn.b", "board.GND"), W("board.D13", "r.a"), W("r.b", "led.anode"), W("led.cathode", "board.GND")],
    };
    const code = "function setup(){ pinMode(2, INPUT_PULLUP); pinMode(13, OUTPUT); }\nfunction loop(){ digitalWrite(13, digitalRead(2) === LOW ? HIGH : LOW); delay(10); }";
    const r = runBehaviorTest(circuit, code, {
      id: "btn",
      title: "LED follows button",
      durationMs: 1000,
      inputs: [{ atMs: 300, part: "btn", value: 1 }, { atMs: 600, part: "btn", value: 0 }],
      expect: { kind: "at", checks: [{ atMs: 200, part: "led", on: false }, { atMs: 450, part: "led", on: true }, { atMs: 800, part: "led", on: false }] },
    });
    expect(r.message).toBe("All checks passed.");
  });
});
