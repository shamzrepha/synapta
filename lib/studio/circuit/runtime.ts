import Interpreter from "js-interpreter";
import type { BehaviorTest } from "../spec";
import { boardPinName, isButtonLike } from "./catalog";
import { ULN_ON_VOLTS, newStepperState, stepperUpdate, type StepperState } from "./stepper";
import { Netlist, emptyPinState, evaluateOutputs, i2cWired, netPotential, readPin, term, type Circuit, type OutputState, type PinMode, type PinState } from "./netlist";

/**
 * Runs an Arduino-style program (setup()/loop(), digitalWrite, delay…) inside a sandboxed ES5
 * interpreter on a virtual clock. Nothing in the program can touch the page, the network or the
 * viewer's account, so shared designs are safe to run. The same runtime powers live simulation,
 * behaviour tests and server-side challenge scoring.
 */

/** SSD1306 text layout: 64 rows / 8-row pages = 8 lines; 128 columns / 6-pixel cells = 21 characters */
export const OLED_ROWS = 8;
export const OLED_COLS = 21;

/** Virtual time charged per interpreter step, so busy loops still advance the clock */
const STEP_MS = 0.002;

// One line, so error line numbers match the user's code (line = reported − 1)
const PRELUDE =
  "var HIGH=1,LOW=0,INPUT='INPUT',OUTPUT='OUTPUT',INPUT_PULLUP='INPUT_PULLUP',A0=14,A1=15,A2=16,A3=17,A4=18,A5=19,LED_BUILTIN=13;" +
  "var Serial={begin:function(){},print:function(x){__print(String(x))},println:function(x){__print((x===undefined?'':String(x))+'\\n')}};" +
  "function map(x,a,b,c,d){return (x-a)*(d-c)/(b-a)+c}function constrain(x,a,b){return x<a?a:x>b?b:x}" +
  "function random(a,b){if(b===undefined){b=a;a=0}return Math.floor(a+Math.random()*(b-a))}" +
  // stepperRun(in1,in2,in3,in4,steps,msPerStep): half-step sequence for a 28BYJ-48 on a ULN2003 board (negative steps reverse)
  "var __HS=[[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,1,1],[0,0,0,1],[1,0,0,1]],__SI={};" +
  "function stepperRun(a,b,c,d,steps,ms){var k=a+'_'+b;var i=__SI[k]||0;var dir=steps<0?-1:1;var n=Math.abs(Math.round(steps));pinMode(a,OUTPUT);pinMode(b,OUTPUT);pinMode(c,OUTPUT);pinMode(d,OUTPUT);for(var s=0;s<n;s++){i=(i+dir+8)%8;digitalWrite(a,__HS[i][0]);digitalWrite(b,__HS[i][1]);digitalWrite(c,__HS[i][2]);digitalWrite(d,__HS[i][3]);delay(ms===undefined?2:ms);}__SI[k]=i;}\n";

/** Modern keywords the ES5 sandbox doesn't know, rewritten outside strings and comments. */
export function toEs5(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === "/" && code[i + 1] === "/") {
      const e = code.indexOf("\n", i);
      const end = e < 0 ? code.length : e;
      out += code.slice(i, end);
      i = end;
    } else if (c === "/" && code[i + 1] === "*") {
      const e = code.indexOf("*/", i + 2);
      const end = e < 0 ? code.length : e + 2;
      out += code.slice(i, end);
      i = end;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== c) j += code[j] === "\\" ? 2 : 1;
      out += code.slice(i, j + 1);
      i = j + 1;
    } else {
      const m = /^(?:let|const)\b/.exec(code.slice(i));
      const prev = i > 0 ? code[i - 1] : " ";
      if (m && !/[\w$.]/.test(prev)) {
        out += "var";
        i += m[0].length;
      } else {
        out += c;
        i++;
      }
    }
  }
  return out;
}

/** Answers pulseIn(): how long (µs) the pin stays HIGH, given the trigger pulses the program has sent. */
export type PulseReader = (pin: number, pins: PinState, nowMs: number, trigs: Record<number, { widthUs: number; endMs: number }>) => number;

/** Bus sensors: DHT11 temperature / humidity by data pin, MPU-6050 acceleration in g */
export type SensorReader = (kind: "dhtT" | "dhtH" | "ax" | "ay" | "az", pin: number, pins: PinState) => number;

export type PinReader = ((pin: number, analog: boolean, pins: PinState) => number) & {
  pulse?: PulseReader;
  sensor?: SensorReader;
  /** called after every pin write (steppers follow the coil pattern) */
  onWrite?: (pins: PinState, nowMs: number) => void;
};

export interface RuntimeEvent {
  atMs: number;
  text: string;
}

export class BoardRuntime {
  now = 0;
  pins: PinState = emptyPinState();
  serial: RuntimeEvent[] = [];
  error: string | null = null;
  finished = false;
  private interp: Interpreter | null = null;
  private waitUntil: number | null = null;
  private resume: (() => void) | null = null;
  private steps = 0;
  /** the last HIGH pulse written to each pin (for ultrasonic triggers) */
  private trigs: Record<number, { widthUs: number; endMs: number; riseMs: number }> = {};

  constructor(
    code: string,
    private readonly read: PinReader
  ) {
    const program = PRELUDE + toEs5(code) + "\n;if(typeof setup==='function')setup();if(typeof loop==='function'){while(true){loop();}}";
    try {
      this.interp = new Interpreter(program, (it, global) => {
        const fn = (name: string, f: (...a: never[]) => unknown) => it.setProperty(global, name, it.createNativeFunction(f));
        fn("pinMode", ((pin: number, mode: string) => {
          this.pins.mode[Number(pin)] = (["INPUT", "OUTPUT", "INPUT_PULLUP"].includes(mode) ? mode : "INPUT") as PinMode;
        }) as never);
        fn("digitalWrite", ((pin: number, v: number) => {
          const n = Number(pin);
          const was = this.pins.level[n] === 1 && this.pins.pwm[n] === undefined;
          this.pins.level[n] = v ? 1 : 0;
          delete this.pins.pwm[n];
          const t = (this.trigs[n] ||= { widthUs: 0, endMs: -1, riseMs: -1 });
          if (v && !was) t.riseMs = this.now;
          if (!v && was && t.riseMs >= 0) {
            t.widthUs = (this.now - t.riseMs) * 1000;
            t.endMs = this.now;
          }
          this.read.onWrite?.(this.pins, this.now);
        }) as never);
        fn("analogWrite", ((pin: number, v: number) => {
          const n = Number(pin);
          this.pins.pwm[n] = Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
          if (this.pins.mode[n] === undefined) this.pins.mode[n] = "OUTPUT";
          this.read.onWrite?.(this.pins, this.now);
        }) as never);
        fn("dhtTemperature", ((pin: number) => this.read.sensor?.("dhtT", Number(pin), this.pins) ?? NaN) as never);
        fn("dhtHumidity", ((pin: number) => this.read.sensor?.("dhtH", Number(pin), this.pins) ?? NaN) as never);
        fn("accelX", (() => this.read.sensor?.("ax", 0, this.pins) ?? 0) as never);
        fn("accelY", (() => this.read.sensor?.("ay", 0, this.pins) ?? 0) as never);
        fn("accelZ", (() => this.read.sensor?.("az", 0, this.pins) ?? 0) as never);
        fn("oledClear", (() => {
          this.pins.oled = [];
        }) as never);
        fn("oledPrint", ((text: unknown) => {
          for (const line of String(text).split("\n")) this.pins.oled.push(line.slice(0, OLED_COLS));
          while (this.pins.oled.length > OLED_ROWS) this.pins.oled.shift();
        }) as never);
        fn("oledText", ((row: number, text: unknown) => {
          const r = Math.max(0, Math.min(OLED_ROWS - 1, Math.floor(Number(row) || 0)));
          while (this.pins.oled.length <= r) this.pins.oled.push("");
          this.pins.oled[r] = String(text).slice(0, OLED_COLS);
        }) as never);
        fn("digitalRead", ((pin: number) => this.read(Number(pin), false, this.pins)) as never);
        fn("analogRead", ((pin: number) => this.read(Number(pin), true, this.pins)) as never);
        fn("millis", (() => Math.floor(this.now)) as never);
        fn("tone", ((pin: number, hz: number) => {
          const n = Number(pin);
          this.pins.tone[n] = Math.max(1, Number(hz) || 440);
          if (this.pins.mode[n] === undefined) this.pins.mode[n] = "OUTPUT";
        }) as never);
        fn("noTone", ((pin: number) => {
          delete this.pins.tone[Number(pin)];
        }) as never);
        fn("servoWrite", ((pin: number, angle: number) => {
          this.pins.servo[Number(pin)] = Math.max(0, Math.min(180, Number(angle) || 0));
        }) as never);
        fn("__print", ((s: string) => {
          if (this.serial.length < 500) this.serial.push({ atMs: Math.round(this.now), text: String(s) });
        }) as never);
        it.setProperty(
          global,
          "delayMicroseconds",
          it.createAsyncFunction(((us: number, cb: () => void) => {
            this.waitUntil = this.now + Math.max(0, Number(us) || 0) / 1000;
            this.resume = cb;
          }) as never)
        );
        // pulseIn(pin, HIGH): the echo time in µs, from the sensor model (0 = timed out)
        it.setProperty(
          global,
          "pulseIn",
          it.createAsyncFunction(((pin: number, _level: number, _timeout: number, cb?: (v: number) => void) => {
            const done = (typeof _level === "function" ? _level : typeof _timeout === "function" ? _timeout : cb) as unknown as (v: number) => void;
            const us = this.read.pulse?.(Number(pin), this.pins, this.now, this.trigs) ?? 0;
            if (us > 0) {
              const t = this.trigs;
              for (const k of Object.keys(t)) if (t[Number(k)].endMs >= 0) t[Number(k)].endMs = -1; // one trigger → one echo
            }
            this.waitUntil = this.now + Math.max(us / 1000, 0.001);
            this.resume = () => done(us);
          }) as never)
        );
        it.setProperty(
          global,
          "delay",
          it.createAsyncFunction(((ms: number, cb: () => void) => {
            this.waitUntil = this.now + Math.max(0, Number(ms) || 0);
            this.resume = cb;
          }) as never)
        );
      });
    } catch (e) {
      this.error = formatError(e);
      this.finished = true;
    }
  }

  /** Runs until virtual time reaches `toMs` (or the step budget runs out, to keep the UI smooth). */
  advance(toMs: number, maxSteps = 200_000): void {
    if (!this.interp || this.finished) {
      this.now = Math.max(this.now, toMs);
      return;
    }
    let budget = maxSteps;
    while (this.now < toMs && budget > 0) {
      if (this.waitUntil !== null) {
        if (this.waitUntil <= toMs) {
          this.now = this.waitUntil;
          this.waitUntil = null;
          const cb = this.resume;
          this.resume = null;
          cb?.();
        } else {
          this.now = toMs;
          break;
        }
        continue;
      }
      try {
        const more = this.interp.step();
        this.steps++;
        budget--;
        this.now += STEP_MS;
        if (!more) {
          this.finished = true;
          this.now = Math.max(this.now, toMs);
          break;
        }
      } catch (e) {
        this.error = formatError(e);
        this.finished = true;
        break;
      }
    }
  }
}

function formatError(e: unknown): string {
  const err = e as { message?: string; loc?: { line: number; column: number } };
  const msg = err?.message || String(e);
  const loc = err?.loc || /\((\d+):(\d+)\)/.exec(msg);
  if (loc && "line" in (loc as object)) {
    const l = loc as { line: number; column: number };
    return `Line ${Math.max(1, l.line - 1)}: ${msg.replace(/\s*\(\d+:\d+\)$/, "")}`;
  }
  if (Array.isArray(loc)) return `Line ${Math.max(1, Number(loc[1]) - 1)}: ${msg.replace(/\s*\(\d+:\d+\)$/, "")}`;
  return msg;
}

/** Pin reads for a runtime, from the circuit's nets, pressed buttons and sensor values. */
export function circuitReader(circuit: Circuit, inputs: { pressed: Set<string>; values: Record<string, number> }) {
  let cacheKey = "";
  let nl = new Netlist(circuit, inputs.pressed);
  const reader = (pin: number, analog: boolean, pins: PinState) => {
    const key = Array.from(inputs.pressed).sort().join(",");
    if (key !== cacheKey) {
      cacheKey = key;
      nl = new Netlist(circuit, inputs.pressed);
    }
    return readPin(nl, pins, pin, analog, inputs.values);
  };
  const powered = (id: string, vccMin: number, pins: PinState) => (netPotential(nl, nl.netOf(term(id, "vcc")), pins) ?? 0) >= vccMin && netPotential(nl, nl.netOf(term(id, "gnd")), pins) === 0;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const steppers = new Map<string, StepperState>(circuit.parts.filter((p) => p.type === "stepper").map((p) => [p.id, newStepperState()]));
  /** 28BYJ-48 + ULN2003: follow the coil pattern on IN1–IN4 (see stepper.ts) */
  if (steppers.size) {
    reader.onWrite = (pins: PinState, nowMs: number) => {
      for (const [id, st] of steppers) {
        const bits = ["in1", "in2", "in3", "in4"].map((n) => ((netPotential(nl, nl.netOf(term(id, n)), pins) ?? 0) > ULN_ON_VOLTS ? 1 : 0));
        const moved = stepperUpdate(st, bits, powered(id, 4.5, pins), nowMs);
        if (moved) pins.stepper[id] = (pins.stepper[id] ?? 0) + moved;
      }
    };
  }
  /** DHT11 (whole °C 0–50, whole %RH 20–90 — datasheet) and MPU-6050 (±2 g, 16384 LSB/g) */
  reader.sensor = ((kind: string, pin: number, pins: PinState) => {
    if (kind === "dhtT" || kind === "dhtH") {
      const name = boardPinName(pin);
      if (!nl.board || !name) return NaN;
      const net = nl.netOf(term(nl.board.id, name));
      const s = circuit.parts.find((p) => p.type === "dht11" && nl.netOf(term(p.id, "data")) === net);
      if (!s || !powered(s.id, 3, pins)) return NaN;
      if (kind === "dhtT") return Math.round(clamp(inputs.values[s.id] ?? Number(s.props?.value ?? 24), 0, 50));
      return Math.round(clamp(inputs.values[s.id + "#b"] ?? Number(s.props?.humidity ?? 55), 20, 90));
    }
    const m = circuit.parts.find((p) => p.type === "mpu6050" && i2cWired(nl, p.id) && powered(p.id, 3, pins));
    if (!m) return 0;
    const rad = (d: number) => (clamp(d, -90, 90) * Math.PI) / 180;
    const tx = rad(inputs.values[m.id] ?? Number(m.props?.value ?? 0));
    const ty = rad(inputs.values[m.id + "#b"] ?? Number(m.props?.tiltY ?? 0));
    const g = kind === "ax" ? Math.sin(tx) : kind === "ay" ? Math.cos(tx) * Math.sin(ty) : Math.cos(tx) * Math.cos(ty);
    return Math.round(g * 16384) / 16384;
  }) as SensorReader;
  /** HC-SR04: needs power, a ≥10 µs HIGH trigger pulse, and answers with echo µs = cm × 58 (datasheet) */
  reader.pulse = ((pin, pins, nowMs, trigs) => {
    if (!nl.board) return 0;
    const name = boardPinName(pin);
    if (!name) return 0;
    const net = nl.netOf(term(nl.board.id, name));
    for (const sensor of circuit.parts) {
      if (sensor.type !== "hc_sr04" || nl.netOf(term(sensor.id, "echo")) !== net) continue;
      const powered = (netPotential(nl, nl.netOf(term(sensor.id, "vcc")), pins) ?? 0) >= 4.5 && netPotential(nl, nl.netOf(term(sensor.id, "gnd")), pins) === 0;
      if (!powered) return 0;
      const triggered = nl.boardPinsOn(nl.netOf(term(sensor.id, "trig"))).some((n) => {
        const num = boardNumber(n);
        const t = num === undefined ? undefined : trigs[num];
        return !!t && t.widthUs >= 10 && nowMs - t.endMs <= 2 && t.endMs >= 0;
      });
      if (!triggered) return 0;
      const cm = inputs.values[sensor.id] ?? Number(sensor.props?.value ?? 100);
      if (cm < 2 || cm > 400) return 0; // outside the datasheet range there is no usable echo
      return Math.round(cm * 58);
    }
    return 0;
  }) as PulseReader;
  return reader;
}

function boardNumber(pinName: string): number | undefined {
  const m = /^D(\d+)$/.exec(pinName);
  if (m) return Number(m[1]);
  const a = /^A(\d)$/.exec(pinName);
  return a ? 14 + Number(a[1]) : undefined;
}

export interface TestResult {
  id: string;
  title: string;
  pass: boolean;
  message: string;
  /** compressed on/off timeline of the watched parts */
  timeline: Array<{ atMs: number; state: number[] }>;
}

/** Runs a behaviour test against the circuit + code with virtual time (deterministic, ~ms fast). */
export function runBehaviorTest(circuit: Circuit, code: string, test: BehaviorTest): TestResult {
  const inputs = { pressed: new Set<string>(), values: {} as Record<string, number> };
  const rt = new BoardRuntime(code, circuitReader(circuit, inputs));
  const watched = test.expect.kind === "sequence" ? test.expect.parts : Array.from(new Set(test.expect.checks.map((c) => c.part)));
  const events = [...test.inputs].sort((a, b) => a.atMs - b.atMs);
  const SAMPLE = 10;
  const timeline: Array<{ atMs: number; state: number[] }> = [];
  const atChecks = test.expect.kind === "at" ? [...test.expect.checks].sort((a, b) => a.atMs - b.atMs) : [];
  const failures: string[] = [];
  let checkIdx = 0;
  let ei = 0;

  for (let t = 0; t <= test.durationMs; t += SAMPLE) {
    while (ei < events.length && events[ei].atMs <= t) {
      const ev = events[ei++];
      const part = circuit.parts.find((p) => p.id === ev.part);
      if (part && isButtonLike(part.type)) {
        if (ev.value) inputs.pressed.add(ev.part);
        else inputs.pressed.delete(ev.part);
      } else inputs.values[ev.part] = ev.value;
    }
    rt.advance(t, 2_000_000);
    if (rt.error) return { id: test.id, title: test.title, pass: false, message: `Program error — ${rt.error}`, timeline };
    const outs = evaluateOutputs(new Netlist(circuit, inputs.pressed), rt.pins);
    const state = watched.map((id) => (outs[id]?.on ? 1 : 0));
    const last = timeline[timeline.length - 1];
    if (!last || last.state.join() !== state.join()) timeline.push({ atMs: t, state });
    while (checkIdx < atChecks.length && atChecks[checkIdx].atMs <= t) {
      const c = atChecks[checkIdx++];
      const on = !!outs[c.part]?.on;
      if (on !== c.on) failures.push(`At ${(c.atMs / 1000).toFixed(1)} s ${c.part} should be ${c.on ? "ON" : "OFF"} but is ${on ? "ON" : "OFF"}.`);
    }
  }

  if (test.expect.kind === "at") {
    return { id: test.id, title: test.title, pass: failures.length === 0, message: failures[0] || "All checks passed.", timeline };
  }

  // Sequence: drop glitches shorter than minMs, then look for the expected states in order
  const exp = test.expect;
  const runs: Array<{ state: string; ms: number }> = [];
  timeline.forEach((p, i) => {
    const end = i + 1 < timeline.length ? timeline[i + 1].atMs : test.durationMs;
    runs.push({ state: p.state.join(""), ms: end - p.atMs });
  });
  const stable = runs.filter((r, i) => r.ms >= exp.minMs || i === runs.length - 1).map((r) => r.state);
  const merged = stable.filter((s, i) => i === 0 || s !== stable[i - 1]);
  const wanted = Array.from({ length: exp.cycles }, () => exp.states.map((s) => s.join(""))).flat();
  let found = false;
  for (let i = 0; i + wanted.length <= merged.length && !found; i++) {
    found = wanted.every((w, k) => merged[i + k] === w);
  }
  const fmt = (s: string) => exp.parts.map((p, i) => `${p} ${s[i] === "1" ? "ON" : "off"}`).join(", ");
  return {
    id: test.id,
    title: test.title,
    pass: found,
    message: found
      ? "Sequence matches."
      : merged.length <= 1
        ? `Outputs never changed (${merged[0] ? fmt(merged[0]) : "nothing ran"}).`
        : `Expected ${wanted.map(fmt).join(" → ")}; saw ${merged.slice(0, 6).map(fmt).join(" → ")}.`,
    timeline,
  };
}

export type { OutputState };
