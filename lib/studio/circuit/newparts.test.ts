import { describe, it, expect } from "vitest";
import { Netlist, evaluateOutputs } from "./netlist";
import { BoardRuntime, circuitReader } from "./runtime";
import { checkCircuit } from "./checker";
import { coilPosition, stepDelta, stepperDegrees, HALF_STEPS_PER_REV } from "./stepper";
import { promptPack, shopItem } from "../parts/shop";
import { VERIFIED_BY_TYPE } from "../parts/library";

const P = (id: string, type: string, props?: Record<string, string | number>) => ({ id, type, x: 0, y: 0, props });
let n = 0;
const W = (from: string, to: string) => ({ id: `w${n++}`, from, to });

function run(circuit: { parts: ReturnType<typeof P>[]; wires: ReturnType<typeof W>[] }, code: string, ms: number, values: Record<string, number> = {}) {
  const inputs = { pressed: new Set<string>(), values };
  const rt = new BoardRuntime(code, circuitReader(circuit, inputs));
  rt.advance(ms, 5_000_000);
  expect(rt.error).toBeNull();
  return { rt, out: evaluateOutputs(new Netlist(circuit, inputs.pressed), rt.pins) };
}

describe("verified library entries", () => {
  it("has the five new parts, each with sources and facts, and shop usage", () => {
    for (const t of ["stepper", "oled", "dht11", "relay", "mpu6050"]) {
      const v = VERIFIED_BY_TYPE[t];
      expect(v, t).toBeDefined();
      expect(v.sources.length, t).toBeGreaterThan(0);
      for (const f of v.facts) expect(v.sources.some((s) => s.id === f.src), `${t}: ${f.label}`).toBe(true);
      expect(shopItem(t)?.verified).toBe(true);
      expect(shopItem(t)?.usage.code, t).toBeTruthy();
    }
    expect(promptPack(["stepper"])).toContain("5.625");
    expect(promptPack(["dht11"])).toContain("0–50 °C");
  });
});

describe("relay module", () => {
  const base = (loadOnNo: boolean, props: Record<string, number> = {}) => ({
    parts: [P("board", "board"), P("rl", "relay", props), P("bat", "battery", { volts: 6 }), P("r1", "resistor", { ohms: 220 }), P("led", "led")],
    wires: [
      W("rl.vcc", "board.5V"), W("rl.gnd", "board.GND"), W("rl.in", "board.D7"),
      W("bat.minus", "board.GND"), W("bat.plus", "rl.com"),
      W(loadOnNo ? "rl.no" : "rl.nc", "r1.a"), W("r1.b", "led.anode"), W("led.cathode", "board.GND"),
    ],
  });
  const code = (v: number) => `function setup(){pinMode(7,OUTPUT);digitalWrite(7,${v});}function loop(){}`;
  it("active-LOW module: IN LOW energises the coil, COM connects to NO and lights the LED from the battery", () => {
    const { out } = run(base(true), code(0), 50);
    expect(out.rl.energised).toBe(true);
    expect(out.led.on).toBe(true);
  });
  it("IN HIGH on an active-LOW module: contacts rest on NC, so the NO load stays off", () => {
    const { out } = run(base(true), code(1), 50);
    expect(out.rl.energised).toBe(false);
    expect(out.led.on).toBe(false);
  });
  it("the NC load is on while the coil is not energised and off while it is", () => {
    expect(run(base(false), code(1), 50).out.led.on).toBe(true);
    expect(run(base(false), code(0), 50).out.led.on).toBe(false);
  });
  it("active-HIGH module (activeLow 0) energises on HIGH", () => {
    expect(run(base(true, { activeLow: 0 }), code(1), 50).out.rl.energised).toBe(true);
    expect(run(base(true, { activeLow: 0 }), code(0), 50).out.rl.energised).toBe(false);
  });
  it("without module power the coil does not pull in (needs 3.75 V)", () => {
    const c = base(true);
    c.wires = c.wires.filter((w) => w.from !== "rl.vcc");
    expect(run(c, code(0), 50).out.rl.energised).toBe(false);
  });
  it("switches a motor from a battery", () => {
    const c = {
      parts: [P("board", "board"), P("rl", "relay"), P("bat", "battery", { volts: 6 }), P("m", "dc_motor")],
      wires: [W("rl.vcc", "board.5V"), W("rl.gnd", "board.GND"), W("rl.in", "board.D7"), W("bat.minus", "board.GND"), W("bat.plus", "rl.com"), W("rl.no", "m.a"), W("m.b", "board.GND")],
    };
    expect(run(c, code(0), 50).out.m.on).toBe(true);
    expect(run(c, code(1), 50).out.m.on).toBe(false);
  });
  it("blinking code toggles the relay over time", () => {
    const blink = "function setup(){pinMode(7,OUTPUT);}function loop(){digitalWrite(7,LOW);delay(100);digitalWrite(7,HIGH);delay(100);}";
    const a = run(base(true), blink, 50).out.rl.energised;
    const b = run(base(true), blink, 150).out.rl.energised;
    expect(a).toBe(true);
    expect(b).toBe(false);
  });
});

describe("28BYJ-48 stepper", () => {
  const circuit = {
    parts: [P("board", "board"), P("st", "stepper")],
    wires: [W("st.vcc", "board.5V"), W("st.gnd", "board.GND"), W("board.D8", "st.in1"), W("board.D9", "st.in2"), W("board.D10", "st.in3"), W("board.D11", "st.in4")],
  };
  it("datasheet geometry: 5.625° stride and 1/64 gearing give 4096 half-steps per turn", () => {
    expect(HALF_STEPS_PER_REV).toBe((360 / 5.625) * 64);
    expect(stepperDegrees(4096)).toBe(360);
    expect(stepperDegrees(512)).toBe(45);
  });
  it("coil patterns map to half-step positions", () => {
    expect(coilPosition([1, 0, 0, 0])).toBe(0);
    expect(coilPosition([1, 1, 0, 0])).toBe(1);
    expect(coilPosition([0, 1, 0, 0])).toBe(2);
    expect(coilPosition([1, 0, 0, 1])).toBe(7);
    expect(coilPosition([0, 0, 0, 0])).toBeNull();
    expect(coilPosition([1, 0, 1, 0])).toBeNull();
    expect(stepDelta(7, 0)).toBe(1);
    expect(stepDelta(0, 7)).toBe(-1);
    expect(stepDelta(0, 4)).toBeNull();
  });
  it("stepperRun: 4096 half-steps is one full turn of the output shaft", () => {
    const { out } = run(circuit, "function setup(){stepperRun(8,9,10,11,4096,2);}function loop(){}", 12000);
    expect(out.st.rotation!).toBeCloseTo(360, 1);
  });
  it("512 steps turn 45° and negative steps turn back", () => {
    const fwd = run(circuit, "function setup(){stepperRun(8,9,10,11,512,2);}function loop(){}", 2000).out.st.rotation!;
    expect(fwd).toBeCloseTo(45, 1);
    const back = run(circuit, "function setup(){stepperRun(8,9,10,11,512,2);stepperRun(8,9,10,11,-256,2);}function loop(){}", 3000).out.st.rotation!;
    expect(back).toBeCloseTo(22.5, 1);
  });
  it("raw 4-pin full-step driving works too (100 full steps = 200 half-steps)", () => {
    const raw = `var seq=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
      function setup(){for(var p=8;p<=11;p++)pinMode(p,OUTPUT);
        for(var i=0;i<100;i++){var s=seq[i%4];for(var k=0;k<4;k++)digitalWrite(8+k,s[k]);delay(2);}}
      function loop(){}`;
    const { out } = run(circuit, raw, 1000);
    expect(out.st.rotation!).toBeCloseTo(stepperDegrees(198), 1); // the first pattern only sets the reference
  });
  it("stepping faster than the motor can follow loses steps", () => {
    const { out } = run(circuit, "function setup(){stepperRun(8,9,10,11,400,0);}function loop(){}", 2000);
    expect(out.st.rotation!).toBeLessThan(stepperDegrees(399));
  });
  it("no motor power, no movement", () => {
    const dead = { ...circuit, wires: circuit.wires.filter((w) => w.from !== "st.vcc") };
    const { out } = run(dead, "function setup(){stepperRun(8,9,10,11,200,2);}function loop(){}", 1000);
    expect(out.st.rotation).toBe(0);
    expect(out.st.fault).toBe("unpowered");
  });
});

describe("SSD1306 OLED", () => {
  const wired = {
    parts: [P("board", "board"), P("oled", "oled")],
    wires: [W("oled.vcc", "board.3V3"), W("oled.gnd", "board.GND"), W("oled.sda", "board.A4"), W("oled.scl", "board.A5")],
  };
  it("oledPrint draws text lines on the bench part", () => {
    const { out } = run(wired, "function setup(){oledClear();oledPrint('Hello');oledPrint('World');}function loop(){}", 50);
    expect(out.oled.on).toBe(true);
    expect(out.oled.text).toEqual(["Hello", "World"]);
  });
  it("oledText sets a row, long text is cut to 21 characters and only 8 lines are kept", () => {
    const { out } = run(wired, "function setup(){oledText(2,'abcdefghijklmnopqrstuvwxyz');}function loop(){}", 50);
    expect(out.oled.text![2]).toBe("abcdefghijklmnopqrstu");
    const many = run(wired, "function setup(){for(var i=0;i<12;i++)oledPrint('L'+i);}function loop(){}", 50).out.oled.text!;
    expect(many).toHaveLength(8);
    expect(many[7]).toBe("L11");
  });
  it("shows nothing without I2C on A4/A5 or without power, and the checker explains", () => {
    const bad = { ...wired, wires: [W("oled.vcc", "board.3V3"), W("oled.gnd", "board.GND"), W("oled.sda", "board.D2"), W("oled.scl", "board.D3")] };
    const { out } = run(bad, "function setup(){oledPrint('x');}function loop(){}", 50);
    expect(out.oled.on).toBe(false);
    expect(out.oled.text).toEqual([]);
    expect(checkCircuit(bad, "").some((i) => /A4/.test(i.message))).toBe(true);
    expect(checkCircuit(wired, "").some((i) => /A4/.test(i.message))).toBe(false);
  });
});

describe("DHT11", () => {
  const circuit = { parts: [P("board", "board"), P("d", "dht11")], wires: [W("d.vcc", "board.5V"), W("d.gnd", "board.GND"), W("d.data", "board.D2")] };
  const code = "function setup(){Serial.begin(9600);}function loop(){Serial.println(dhtTemperature(2)+','+dhtHumidity(2));delay(1000);}";
  it("reads whole-number temperature and humidity from the sliders", () => {
    const { rt } = run(circuit, code, 100, { d: 31.6, "d#b": 64 });
    expect(rt.serial[0].text).toBe("32,64\n");
  });
  it("clamps to the datasheet ranges (0–50 °C, 20–90 %RH)", () => {
    expect(run(circuit, code, 100, { d: 80, "d#b": 5 }).rt.serial[0].text).toBe("50,20\n");
    expect(run(circuit, code, 100, { d: -5, "d#b": 99 }).rt.serial[0].text).toBe("0,90\n");
  });
  it("is NaN when unpowered or on another pin", () => {
    const dead = { ...circuit, wires: circuit.wires.filter((w) => w.from !== "d.vcc") };
    expect(run(dead, code, 100).rt.serial[0].text).toBe("NaN,NaN\n");
    const other = "function setup(){Serial.begin(9600);}function loop(){Serial.println(dhtTemperature(5));delay(1000);}";
    expect(run(circuit, other, 100).rt.serial[0].text).toBe("NaN\n");
  });
});

describe("MPU-6050", () => {
  const circuit = {
    parts: [P("board", "board"), P("m", "mpu6050")],
    wires: [W("m.vcc", "board.5V"), W("m.gnd", "board.GND"), W("m.sda", "board.A4"), W("m.scl", "board.A5")],
  };
  const code = "function setup(){Serial.begin(9600);}function loop(){Serial.println(accelX()+' '+accelY()+' '+accelZ());delay(100);}";
  const read = (c: typeof circuit, values: Record<string, number> = {}) => run(c, code, 50, values).rt.serial[0].text.trim().split(" ").map(Number);
  it("flat and still reads 0, 0, +1 g", () => {
    expect(read(circuit)).toEqual([0, 0, 1]);
  });
  it("tilting splits gravity between axes (30° → 0.5 g on X) and keeps 1 g in total", () => {
    const [x, y, z] = read(circuit, { m: 30, "m#b": 20 });
    expect(x).toBeCloseTo(0.5, 3);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 3);
    const [x2, , z2] = read(circuit, { m: 90 });
    expect(x2).toBe(1);
    expect(z2).toBeCloseTo(0, 3);
  });
  it("readings are quantised to 1/16384 g", () => {
    const [x] = read(circuit, { m: 10 });
    expect(Math.round(x * 16384)).toBeCloseTo(x * 16384, 6);
  });
  it("reads 0 without I2C wiring on A4/A5", () => {
    const bad = { ...circuit, wires: [W("m.vcc", "board.5V"), W("m.gnd", "board.GND"), W("m.sda", "board.D2"), W("m.scl", "board.D3")] };
    expect(read(bad as never, { m: 30 })).toEqual([0, 0, 0]);
    expect(checkCircuit(bad as never, "").some((i) => /A4/.test(i.message))).toBe(true);
  });
});
