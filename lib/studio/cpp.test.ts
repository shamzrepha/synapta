import { describe, expect, it } from "vitest";
import { cppToJs, cppProblems, looksLikeCpp } from "./cpp";
import { BoardRuntime, circuitReader } from "./circuit/runtime";
import type { Circuit } from "./circuit/netlist";

const circuit: Circuit = {
  parts: [
    { id: "board", type: "board", x: 0, y: 0 },
    { id: "led1", type: "led", x: 0, y: 0, props: { color: "red" } },
    { id: "r1", type: "resistor", x: 0, y: 0, props: { ohms: 220 } },
    { id: "pot", type: "potentiometer", x: 0, y: 0 },
  ],
  wires: [
    { id: "w1", from: "board.D9", to: "r1.a" },
    { id: "w2", from: "r1.b", to: "led1.anode" },
    { id: "w3", from: "led1.cathode", to: "board.GND" },
    { id: "w4", from: "board.5V", to: "pot.vcc" },
    { id: "w5", from: "board.GND", to: "pot.gnd" },
    { id: "w6", from: "pot.wiper", to: "board.A0" },
  ],
} as unknown as Circuit;

const SKETCH = `#include <Arduino.h>
#define LED_PIN 9
const int potPin = A0;
int brightness = 0;
int levels[3] = {10, 20, 30};

int scale(int raw) {
  return map(raw, 0, 1023, 0, 255);
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(potPin);
  brightness = scale(raw);
  analogWrite(LED_PIN, brightness);
  delay(10);
}
`;

describe("Arduino C++ sketches", () => {
  it("recognises C++ and leaves old JavaScript alone", () => {
    expect(looksLikeCpp(SKETCH)).toBe(true);
    const js = "var led = 13;\nfunction setup(){ pinMode(led, OUTPUT); }\nfunction loop(){ digitalWrite(led, HIGH); }";
    expect(looksLikeCpp(js)).toBe(false);
    expect(cppToJs(js)).toBe(js);
  });

  it("keeps line numbers and strips types", () => {
    const out = cppToJs(SKETCH);
    expect(out.split("\n").length).toBe(SKETCH.split("\n").length);
    expect(out).toContain("function setup()");
    expect(out).toContain("function scale(raw)");
    expect(out).toContain("var potPin = __int(A0);");
    expect(out).toContain("levels = [10, 20, 30]");
    expect(out).not.toMatch(/\bvoid\b/);
  });

  it("dims an LED from a potentiometer (analogRead → analogWrite)", () => {
    for (const [raw, want] of [[0, 0], [512, 127], [1023, 255]] as const) {
      const inputs = { pressed: new Set<string>(), values: { pot: raw } as Record<string, number> };
      const rt = new BoardRuntime(SKETCH, circuitReader(circuit, inputs));
      rt.advance(100);
      expect(rt.error).toBeNull();
      expect(rt.pins.pwm[9]).toBe(want);
    }
  });

  it("truncates int maths and casts like C", () => {
    const code = `int a = 7 / 2;\nfloat b = 7 / 2.0;\nint c = (int)(b * 2);\nvoid setup() { Serial.println(a); Serial.println(b); Serial.println(c); }\nvoid loop() {}`;
    const rt = new BoardRuntime(code, circuitReader(circuit, { pressed: new Set(), values: {} }));
    rt.advance(10);
    expect(rt.error).toBeNull();
    expect(rt.serial.map((s) => s.text.trim())).toEqual(["3", "3.5", "7"]);
  });

  it("runs a Servo sketch and uninitialised globals", () => {
    const code = `#include <Servo.h>\nServo s;\nint n;\nvoid setup() { s.attach(9); n++; s.write(45 + n); }\nvoid loop() {}`;
    const rt = new BoardRuntime(code, circuitReader(circuit, { pressed: new Set(), values: {} }));
    rt.advance(10);
    expect(rt.error).toBeNull();
    expect(rt.pins.servo[9]).toBe(46);
  });

  it("reports what it can't simulate", () => {
    expect(cppProblems("struct P { int x; };\nvoid loop(){}")[0].line).toBe(1);
    expect(cppProblems("#include <Adafruit_NeoPixel.h>")[0].message).toContain("isn't simulated");
    expect(cppProblems(SKETCH)).toEqual([]);
  });
});
