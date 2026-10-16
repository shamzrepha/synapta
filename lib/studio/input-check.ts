import { CATALOG_BY_TYPE } from "./circuit/catalog";
import { Netlist, term } from "./circuit/netlist";
import { BoardRuntime, circuitReader } from "./circuit/runtime";
import { scanCode } from "./circuit/netlist";
import { compileBlocks, type BlockProgram } from "./blocks";
import type { DesignSpec } from "./spec";

/**
 * A knob or sensor that nothing reads is the classic AI mistake: the lab "dims an LED with a potentiometer"
 * but the code writes a guessed brightness. These checks catch it from the wiring (not from what the AI says)
 * and `repairInputUse` fixes the common case directly, so a lab always reads its inputs.
 */
const ANALOG_INPUTS = new Set(["potentiometer", "light_sensor", "temp_sensor"]);
const PWM_PINS = [3, 5, 6, 9, 10, 11];

const boardNumber = (name: string): number | undefined => {
  const d = /^D(\d+)$/.exec(name);
  if (d) return Number(d[1]);
  const a = /^A(\d)$/.exec(name);
  return a ? 14 + Number(a[1]) : undefined;
};

/** Knobs and sensors wired to one of the board's analog pins. */
export function analogInputs(spec: Pick<DesignSpec, "circuit">): Array<{ id: string; label: string; pin: number }> {
  const c = spec.circuit;
  if (!c) return [];
  const nl = new Netlist(c, new Set());
  const out: Array<{ id: string; label: string; pin: number }> = [];
  for (const p of c.parts) {
    if (!ANALOG_INPUTS.has(p.type)) continue;
    const sig = CATALOG_BY_TYPE[p.type]?.pins.find((x) => x.role === "signalOut");
    if (!sig) continue;
    for (const name of nl.boardPinsOn(nl.netOf(term(p.id, sig.name)))) {
      const n = boardNumber(name);
      if (n !== undefined && n >= 14) out.push({ id: p.id, label: p.label || p.id, pin: n });
    }
  }
  return out;
}

/** PWM-capable pins that have something wired to them (an LED, a motor driver input…). */
export function drivenPwmPins(spec: Pick<DesignSpec, "circuit" | "code">): number[] {
  const c = spec.circuit;
  if (!c) return [];
  const nl = new Netlist(c, new Set());
  const board = c.parts.find((p) => p.type === "board");
  if (!board) return [];
  const wired = PWM_PINS.filter((n) => nl.peers(term(board.id, `D${n}`)).some((t) => !t.startsWith(`${board.id}.`)));
  const written = scanCode(spec.code || "").writes;
  return [...wired.filter((n) => written.has(n)), ...wired.filter((n) => !written.has(n))];
}

const snapshot = (rt: BoardRuntime) => JSON.stringify({ pwm: rt.pins.pwm, level: rt.pins.level, servo: rt.pins.servo, tone: rt.pins.tone });

/** Facts about knobs/sensors that the design ignores. Empty when every input is read and changes something. */
export function inputProblems(spec: DesignSpec): string[] {
  const c = spec.circuit;
  if (!c || !spec.code?.trim()) return [];
  const inputs = analogInputs(spec);
  if (!inputs.length) return [];
  const problems: string[] = [];
  const reads = scanCode(spec.code).reads;
  for (const inp of inputs) {
    if (!reads.has(inp.pin)) {
      problems.push(`INPUT NEVER READ: the ${inp.label} is wired to A${inp.pin - 14}, but the code never calls analogRead(A${inp.pin - 14}). Read it and use the value (for a dimmer: knob = analogRead(A0); level = map(knob, 0, 1023, 0, 255); analogWrite(pin, level)). Never write a guessed fixed value for something a knob or sensor should control.`);
    }
  }
  if (!problems.length) {
    // it is read: does moving it change anything the board drives?
    const run = (value: number) => {
      const values: Record<string, number> = {};
      for (const i of inputs) values[i.id] = value;
      const rt = new BoardRuntime(spec.code!, circuitReader(c, { pressed: new Set(), values }));
      rt.advance(400, 400_000);
      return rt.error ? null : snapshot(rt);
    };
    const low = run(0);
    const high = run(1023);
    if (low !== null && high !== null && low === high) {
      problems.push(`INPUT HAS NO EFFECT: turning the ${inputs.map((i) => i.label).join(" / ")} from minimum to maximum changes nothing the board drives. Make the output depend on the reading (e.g. analogWrite(pin, map(analogRead(A0), 0, 1023, 0, 255))).`);
    }
  }
  return problems;
}

/**
 * Rewrites the program as a working "input → output" lab when the AI ignored its knob: read the sensor, rescale it
 * to 0–255, drive the first PWM output that has something wired to it. Returns null when it can't tell what to drive.
 */
export function repairInputUse(spec: DesignSpec): DesignSpec | null {
  const inputs = analogInputs(spec);
  const outs = drivenPwmPins(spec);
  if (!spec.circuit || !inputs.length || !outs.length) return null;
  const program: BlockProgram = {
    setup: [],
    loop: [
      { id: "b1", type: "readAnalog", pin: inputs[0].pin, name: "knob" },
      { id: "b2", type: "map", name: "level", src: "knob", inLow: 0, inHigh: 1023, outLow: 0, outHigh: 255 },
      { id: "b3", type: "pwm", pin: outs[0], value: 0, expr: "level" },
      { id: "b4", type: "wait", ms: 10 },
    ],
  };
  return { ...spec, blocks: program, blockly: undefined, codeMode: "blocks", code: compileBlocks(program) };
}
