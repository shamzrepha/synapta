import { describe, expect, it } from "vitest";
import { parseSpec } from "./spec";
import { analogInputs, inputProblems, repairInputUse } from "./input-check";
import { verifyProblems } from "./ai-build";

const circuit = {
  parts: [
    { id: "board", type: "board", x: 40, y: 200 },
    { id: "led1", type: "led", x: 300, y: 60, props: { color: "red" } },
    { id: "r1", type: "resistor", x: 200, y: 60, props: { ohms: 220 } },
    { id: "pot", type: "potentiometer", x: 500, y: 60 },
  ],
  wires: [
    { id: "w1", from: "board.D9", to: "r1.a" },
    { id: "w2", from: "r1.b", to: "led1.anode" },
    { id: "w3", from: "led1.cathode", to: "board.GND" },
    { id: "w4", from: "board.5V", to: "pot.vcc" },
    { id: "w5", from: "board.GND", to: "pot.gnd" },
    { id: "w6", from: "pot.wiper", to: "board.A0" },
  ],
};

const guessed = parseSpec({ kind: "circuit", summary: "dimmer", circuit, code: "void setup() { pinMode(9, OUTPUT); }\nvoid loop() { analogWrite(9, 128); delay(10); }" });
const good = parseSpec({ kind: "circuit", summary: "dimmer", circuit, code: "void setup() {}\nvoid loop() { int knob = analogRead(A0); analogWrite(9, map(knob, 0, 1023, 0, 255)); delay(10); }" });

describe("a lab must read its knob or sensor", () => {
  it("finds the potentiometer from the wiring", () => {
    expect(analogInputs(good)).toEqual([{ id: "pot", label: "pot", pin: 14 }]);
  });

  it("flags an LED written with a guessed brightness while the pot is never read", () => {
    const p = inputProblems(guessed);
    expect(p[0]).toContain("INPUT NEVER READ");
    expect(verifyProblems(guessed).some((x) => x.startsWith("INPUT "))).toBe(true);
  });

  it("flags code that reads the pot but whose output ignores it", () => {
    const ignoring = parseSpec({ kind: "circuit", summary: "x", circuit, code: "void setup() {}\nvoid loop() { int knob = analogRead(A0); analogWrite(9, 128); delay(10); }" });
    expect(inputProblems(ignoring)[0]).toContain("INPUT HAS NO EFFECT");
  });

  it("accepts a lab that really maps the reading to the LED", () => {
    expect(inputProblems(good)).toEqual([]);
  });

  it("repairs the guessed-value lab into a working dimmer (as blocks and code)", () => {
    const fixed = repairInputUse(guessed)!;
    expect(fixed.codeMode).toBe("blocks");
    expect(fixed.blocks?.loop.map((b) => b.type)).toEqual(["readAnalog", "map", "pwm", "wait"]);
    expect(fixed.code).toContain("analogRead(A0)");
    expect(fixed.code).toContain("analogWrite(9, constrain(level, 0, 255))");
    expect(inputProblems(fixed)).toEqual([]);
  });
});
