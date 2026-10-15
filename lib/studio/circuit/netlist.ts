import type { CircuitPart, Wire } from "../spec";
import { CATALOG_BY_TYPE, boardPinName, pinDef, isButtonLike } from "./catalog";

/**
 * Turns parts + wires into electrical nets (union-find), then evaluates a simplified DC model:
 * fixed-potential nets (5V, 3V3, GND, output pins) and resistor paths decide which LEDs, buzzers,
 * servos and motors run. Good enough to teach Ohm's law, polarity, pull-ups and drivers without
 * solving a full circuit.
 */

export interface Circuit {
  parts: CircuitPart[];
  wires: Wire[];
}

export type PinMode = "INPUT" | "OUTPUT" | "INPUT_PULLUP";

export interface PinState {
  mode: Record<number, PinMode>;
  level: Record<number, 0 | 1>;
  pwm: Record<number, number>;
  tone: Record<number, number>;
  servo: Record<number, number>;
}

export function emptyPinState(): PinState {
  return { mode: {}, level: {}, pwm: {}, tone: {}, servo: {} };
}

export interface OutputState {
  on: boolean;
  /** 0..1 brightness / speed */
  level: number;
  /** extra info: "overcurrent", "reversed", "unpowered" */
  fault?: string;
  angle?: number;
  toneHz?: number;
  direction?: 1 | -1;
}

const VF: Record<string, number> = { red: 2, yellow: 2.1, amber: 2.1, green: 2.2, blue: 3, white: 3 };

export function term(part: string, pin: string): string {
  return `${part}.${pin}`;
}

export function splitTerm(t: string): { part: string; pin: string } {
  const i = t.indexOf(".");
  return i < 0 ? { part: t, pin: "" } : { part: t.slice(0, i), pin: t.slice(i + 1) };
}

export class Netlist {
  private parent = new Map<string, string>();
  readonly partsById: Map<string, CircuitPart>;
  readonly board: CircuitPart | null;
  readonly wiredTerms = new Set<string>();

  constructor(readonly circuit: Circuit, pressed: Set<string> = new Set()) {
    this.partsById = new Map(circuit.parts.map((p) => [p.id, p]));
    this.board = circuit.parts.find((p) => p.type === "board") || null;
    for (const p of circuit.parts) {
      const def = CATALOG_BY_TYPE[p.type];
      if (!def) continue;
      for (const pin of def.pins) this.find(term(p.id, pin.name));
      // all ground pins of one board are the same node
      const grounds = def.pins.filter((x) => x.role === "ground" && p.type === "board");
      for (let i = 1; i < grounds.length; i++) this.union(term(p.id, grounds[0].name), term(p.id, grounds[i].name));
      if (isButtonLike(p.type) && pressed.has(p.id)) this.union(term(p.id, "a"), term(p.id, "b"));
    }
    for (const w of circuit.wires) {
      if (!this.valid(w.from) || !this.valid(w.to)) continue;
      this.union(w.from, w.to);
      this.wiredTerms.add(w.from);
      this.wiredTerms.add(w.to);
    }
  }

  valid(t: string): boolean {
    const { part, pin } = splitTerm(t);
    const p = this.partsById.get(part);
    return !!p && !!pinDef(p.type, pin);
  }

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (this.parent.get(c) !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  netOf(t: string): string {
    return this.find(t);
  }

  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }

  /** every terminal on the same net (excluding itself) */
  peers(t: string): string[] {
    const n = this.find(t);
    return Array.from(this.parent.keys()).filter((x) => x !== t && this.find(x) === n);
  }

  boardPinsOn(net: string): string[] {
    if (!this.board) return [];
    const def = CATALOG_BY_TYPE.board;
    return def.pins.filter((p) => this.find(term(this.board!.id, p.name)) === net).map((p) => p.name);
  }

  isWired(partId: string): boolean {
    const p = this.partsById.get(partId);
    if (!p) return false;
    return (CATALOG_BY_TYPE[p.type]?.pins || []).some((pin) => this.wiredTerms.has(term(partId, pin.name)));
  }
}

/** Fixed potential of a net (volts), or undefined when nothing drives it. */
export function netPotential(nl: Netlist, net: string, pins: PinState): number | undefined {
  if (!nl.board) return undefined;
  let v: number | undefined;
  for (const name of nl.boardPinsOn(net)) {
    const def = pinDef("board", name)!;
    if (def.role === "ground") return 0;
    if (def.role === "power") v = Math.max(v ?? 0, def.volts || 5);
    if (def.number !== undefined && pins.mode[def.number] === "OUTPUT") {
      const n = def.number;
      const out = pins.pwm[n] !== undefined ? (5 * pins.pwm[n]) / 255 : pins.tone[n] ? 2.5 : (pins.level[n] || 0) * 5;
      v = Math.max(v ?? 0, out);
    }
  }
  return v;
}

interface Edge {
  to: string;
  ohms: number;
}

function resistorGraph(nl: Netlist): Map<string, Edge[]> {
  const g = new Map<string, Edge[]>();
  for (const p of nl.circuit.parts) {
    if (p.type !== "resistor") continue;
    const a = nl.netOf(term(p.id, "a"));
    const b = nl.netOf(term(p.id, "b"));
    if (a === b) continue;
    const ohms = Math.max(1, Number(p.props?.ohms ?? 220));
    g.set(a, [...(g.get(a) || []), { to: b, ohms }]);
    g.set(b, [...(g.get(b) || []), { to: a, ohms }]);
  }
  return g;
}

/** Cheapest resistor path from `start` to a driven net, preferring high (or low) potential. */
function findSource(nl: Netlist, g: Map<string, Edge[]>, start: string, pins: PinState, wantHigh: boolean): { v: number; ohms: number; pwmDuty?: number; toneHz?: number } | null {
  const dist = new Map<string, number>([[start, 0]]);
  const queue: string[] = [start];
  let best: { v: number; ohms: number; net: string } | null = null;
  while (queue.length) {
    queue.sort((a, b) => dist.get(a)! - dist.get(b)!);
    const n = queue.shift()!;
    const d = dist.get(n)!;
    const v = netPotential(nl, n, pins);
    if (v !== undefined) {
      if (!best || (wantHigh ? v > best.v + 0.01 : v < best.v - 0.01) || (Math.abs(v - best.v) <= 0.01 && d < best.ohms)) best = { v, ohms: d, net: n };
      continue; // a driven net terminates the path
    }
    for (const e of g.get(n) || []) {
      const nd = d + e.ohms;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        queue.push(e.to);
      }
    }
  }
  if (!best) return null;
  // PWM / tone info from the driving pin
  let pwmDuty: number | undefined;
  let toneHz: number | undefined;
  for (const name of nl.boardPinsOn(best.net)) {
    const num = pinDef("board", name)?.number;
    if (num === undefined) continue;
    if (pins.pwm[num] !== undefined) pwmDuty = pins.pwm[num] / 255;
    if (pins.tone[num]) toneHz = pins.tone[num];
  }
  return { v: wantHigh && pwmDuty !== undefined && pwmDuty > 0 ? 5 : best.v, ohms: best.ohms, pwmDuty, toneHz };
}

/** What every output part is doing for the given pin state. */
export function evaluateOutputs(nl: Netlist, pins: PinState): Record<string, OutputState> {
  const g = resistorGraph(nl);
  const out: Record<string, OutputState> = {};
  const potential = (t: string) => netPotential(nl, nl.netOf(t), pins);

  for (const p of nl.circuit.parts) {
    if (p.type === "led" || p.type === "buzzer") {
      const [aPin, cPin] = p.type === "led" ? ["anode", "cathode"] : ["pos", "neg"];
      const hi = findSource(nl, g, nl.netOf(term(p.id, aPin)), pins, true);
      const lo = findSource(nl, g, nl.netOf(term(p.id, cPin)), pins, false);
      const vf = p.type === "led" ? VF[String(p.props?.color || "red")] ?? 2 : 1;
      const drop = hi && lo ? hi.v - lo.v - vf : 0;
      if (!hi || !lo || drop <= 0.05) {
        // reversed? (source on the cathode side, sink on the anode side)
        const rHi = findSource(nl, g, nl.netOf(term(p.id, cPin)), pins, true);
        const rLo = findSource(nl, g, nl.netOf(term(p.id, aPin)), pins, false);
        const reversed = p.type === "led" && !!rHi && !!rLo && rHi.v - rLo.v > vf;
        out[p.id] = { on: false, level: 0, fault: reversed ? "reversed" : undefined };
        continue;
      }
      const ohms = hi.ohms + lo.ohms;
      const amps = ohms > 0 ? drop / ohms : 1;
      const duty = hi.pwmDuty ?? 1;
      const level = Math.max(0.15, Math.min(1, amps / 0.015)) * duty;
      out[p.id] = {
        on: duty > 0.02,
        level,
        fault: p.type === "led" && ohms < 60 ? "overcurrent" : undefined,
        toneHz: p.type === "buzzer" ? hi.toneHz || 2000 : undefined,
      };
    } else if (p.type === "servo") {
      const powered = (potential(term(p.id, "vcc")) ?? 0) >= 4.5 && potential(term(p.id, "gnd")) === 0;
      const sigPins = nl.boardPinsOn(nl.netOf(term(p.id, "signal")));
      const num = sigPins.map((n) => pinDef("board", n)?.number).find((n) => n !== undefined);
      const angle = num !== undefined && pins.servo[num] !== undefined ? pins.servo[num] : 90;
      out[p.id] = { on: powered && num !== undefined, level: powered ? 1 : 0, angle, fault: powered ? undefined : "unpowered" };
    } else if (p.type === "motor_driver") {
      const powered = (potential(term(p.id, "vcc")) ?? 0) >= 4.5 && potential(term(p.id, "gnd")) === 0;
      const sig = findSource(nl, g, nl.netOf(term(p.id, "in")), pins, true);
      const duty = sig ? (sig.pwmDuty ?? (sig.v > 2.5 ? 1 : 0)) : 0;
      out[p.id] = { on: powered && duty > 0, level: powered ? duty : 0, fault: powered ? undefined : "unpowered" };
    }
  }
  // Motors: through a driver, or (badly) straight from a pin
  for (const p of nl.circuit.parts) {
    if (p.type !== "dc_motor") continue;
    const a = nl.netOf(term(p.id, "a"));
    const b = nl.netOf(term(p.id, "b"));
    const driver = nl.circuit.parts.find(
      (d) => d.type === "motor_driver" && ((nl.netOf(term(d.id, "out1")) === a && nl.netOf(term(d.id, "out2")) === b) || (nl.netOf(term(d.id, "out1")) === b && nl.netOf(term(d.id, "out2")) === a))
    );
    if (driver) {
      const st = out[driver.id];
      const dir = nl.netOf(term(driver.id, "out1")) === a ? 1 : -1;
      out[p.id] = { on: !!st?.on, level: st?.level || 0, direction: dir as 1 | -1 };
      continue;
    }
    const va = netPotential(nl, a, pins);
    const vb = netPotential(nl, b, pins);
    const fromPin = [...nl.boardPinsOn(a), ...nl.boardPinsOn(b)].some((n) => pinDef("board", n)?.role === "digital" || pinDef("board", n)?.role === "analog");
    if (va !== undefined && vb !== undefined && Math.abs(va - vb) > 2) {
      out[p.id] = { on: true, level: fromPin ? 0.15 : 1, fault: fromPin ? "overcurrent" : undefined, direction: va > vb ? 1 : -1 };
    } else {
      out[p.id] = { on: false, level: 0 };
    }
  }
  return out;
}

/** digitalRead / analogRead as the board would see them. `values` overrides sensor readings. */
export function readPin(nl: Netlist, pins: PinState, n: number, analog: boolean, values: Record<string, number> = {}): number {
  const name = boardPinName(n);
  if (!nl.board || !name) return 0;
  const net = nl.netOf(term(nl.board.id, name));
  // A sensor output on this net?
  for (const p of nl.circuit.parts) {
    const def = CATALOG_BY_TYPE[p.type];
    if (!def || def.category !== "input" || isButtonLike(p.type)) continue;
    const outPin = def.pins.find((x) => x.role === "signalOut");
    if (!outPin || nl.netOf(term(p.id, outPin.name)) !== net) continue;
    const vcc = def.pins.find((x) => x.role === "power");
    const gnd = def.pins.find((x) => x.role === "ground");
    const powered = (!vcc || (netPotential(nl, nl.netOf(term(p.id, vcc.name)), pins) ?? 0) >= 3) && (!gnd || netPotential(nl, nl.netOf(term(p.id, gnd.name)), pins) === 0);
    const raw = powered ? Math.round(values[p.id] ?? Number(p.props?.value ?? 512)) : 0;
    const v = Math.max(0, Math.min(1023, raw));
    return analog ? v : v > 600 ? 1 : 0;
  }
  const own = { ...pins, mode: { ...pins.mode, [n]: "INPUT" as PinMode } };
  let v = netPotential(nl, net, own);
  if (v === undefined) {
    const g = resistorGraph(nl);
    const pull = findSource(nl, g, net, own, true);
    if (pull) v = pull.v;
  }
  if (v === undefined) v = pins.mode[n] === "INPUT_PULLUP" ? 5 : 0;
  return analog ? Math.round((v / 5) * 1023) : v > 2.5 ? 1 : 0;
}

/** Pins the program touches, found by reading the source (resolves `var RED = 13;`). */
export function scanCode(code: string): { writes: Set<number>; reads: Set<number>; modes: Map<number, string>; hasLoop: boolean; hasSetup: boolean; hasDelay: boolean } {
  const consts = new Map<string, number>();
  for (const m of code.matchAll(/(?:var|let|const|#define)\s+([A-Za-z_]\w*)\s*=?\s*(A[0-5]|\d+)\b/g)) {
    consts.set(m[1], m[2].startsWith("A") ? 14 + Number(m[2].slice(1)) : Number(m[2]));
  }
  const resolve = (tok: string): number | undefined => {
    if (/^\d+$/.test(tok)) return Number(tok);
    if (/^A[0-5]$/.test(tok)) return 14 + Number(tok.slice(1));
    if (tok === "LED_BUILTIN") return 13;
    return consts.get(tok);
  };
  const writes = new Set<number>();
  const reads = new Set<number>();
  const modes = new Map<number, string>();
  for (const m of code.matchAll(/\b(pinMode|digitalWrite|analogWrite|tone|noTone|servoWrite|digitalRead|analogRead)\s*\(\s*([A-Za-z_]\w*|\d+)\s*(?:,\s*([A-Z_]+))?/g)) {
    const n = resolve(m[2]);
    if (n === undefined) continue;
    if (m[1] === "pinMode") modes.set(n, m[3] || "");
    else if (m[1] === "digitalRead" || m[1] === "analogRead") reads.add(n);
    else writes.add(n);
  }
  return {
    writes,
    reads,
    modes,
    hasLoop: /function\s+loop\s*\(/.test(code),
    hasSetup: /function\s+setup\s*\(/.test(code),
    hasDelay: /\bdelay\s*\(/.test(code),
  };
}
