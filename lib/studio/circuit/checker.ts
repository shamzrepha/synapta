import { CATALOG_BY_TYPE, boardPinName, pinDef, isButtonLike } from "./catalog";
import { Netlist, emptyPinState, netPotential, scanCode, term, type Circuit, type PinState } from "./netlist";

/**
 * Wiring and code checks. Like SunRoot's GraphChecker, bad wiring is allowed (that's how people
 * learn); each issue states the fact with numbers (`message`), explains it (`why`) and asks a
 * guiding question (`prompt`) that never gives the answer away.
 */
export interface Issue {
  severity: "error" | "warning" | "info";
  system: "POWER" | "ELECTRICAL" | "SOFTWARE" | "STRUCTURE";
  parts: string[];
  message: string;
  why: string;
  prompt: string;
}

function label(nl: Netlist, id: string): string {
  const p = nl.partsById.get(id);
  return p?.label || `${CATALOG_BY_TYPE[p?.type || ""]?.name || "part"} (${id})`;
}

/** Ohms of the cheapest resistor path from a net to any driven net (0 when directly driven). */
function seriesOhms(nl: Netlist, startTerm: string, pins: PinState): number | null {
  const start = nl.netOf(startTerm);
  const dist = new Map<string, number>([[start, 0]]);
  const queue = [start];
  let best: number | null = null;
  while (queue.length) {
    queue.sort((a, b) => dist.get(a)! - dist.get(b)!);
    const n = queue.shift()!;
    const d = dist.get(n)!;
    if (netPotential(nl, n, pins) !== undefined || nl.boardPinsOn(n).length > 0) {
      best = best === null ? d : Math.min(best, d);
      continue;
    }
    for (const r of nl.circuit.parts.filter((p) => p.type === "resistor")) {
      const a = nl.netOf(term(r.id, "a"));
      const b = nl.netOf(term(r.id, "b"));
      const other = a === n ? b : b === n ? a : null;
      if (!other) continue;
      const nd = d + Math.max(1, Number(r.props?.ohms ?? 220));
      if (nd < (dist.get(other) ?? Infinity)) {
        dist.set(other, nd);
        queue.push(other);
      }
    }
  }
  return best;
}

/** Treat every pin the code writes as an OUTPUT so "potential" questions can be answered statically. */
function staticPins(code: string): PinState {
  const s = emptyPinState();
  const scan = scanCode(code);
  for (const n of scan.writes) {
    s.mode[n] = "OUTPUT";
    s.level[n] = 1;
  }
  return s;
}

export function checkCircuit(circuit: Circuit, code = ""): Issue[] {
  const nl = new Netlist(circuit);
  const issues: Issue[] = [];
  const pins = staticPins(code);
  const boards = circuit.parts.filter((p) => p.type === "board");

  if (boards.length === 0) {
    issues.push({
      severity: "error",
      system: "STRUCTURE",
      parts: [],
      message: "There is no board on the bench.",
      why: "Something has to run your code and switch the parts on and off.",
      prompt: "Which part makes the decisions in this circuit?",
    });
    return issues;
  }
  if (boards.length > 1) {
    issues.push({
      severity: "warning",
      system: "STRUCTURE",
      parts: boards.slice(1).map((b) => b.id),
      message: `There are ${boards.length} boards; only ${boards[0].id} runs code here.`,
      why: "The simulator runs one program.",
      prompt: "Do you need more than one brain for this job?",
    });
  }
  const board = boards[0];

  // Short circuit: 5V and GND on the same net
  const vNet = nl.netOf(term(board.id, "5V"));
  const gNet = nl.netOf(term(board.id, "GND"));
  if (vNet === gNet || nl.netOf(term(board.id, "3V3")) === gNet) {
    issues.push({
      severity: "error",
      system: "POWER",
      parts: [board.id],
      message: "5V (or 3V3) is wired straight to GND — a short circuit.",
      why: "With nothing in between, the current is limited only by the wires; a real board would reset or burn its regulator.",
      prompt: "Follow the wire from 5V. Where does the current go before it gets back to GND?",
    });
  }

  for (const p of circuit.parts) {
    const def = CATALOG_BY_TYPE[p.type];
    if (!def) {
      issues.push({ severity: "error", system: "STRUCTURE", parts: [p.id], message: `Unknown part type "${p.type}".`, why: "The simulator doesn't know this component.", prompt: "Is there a similar part in the parts tray?" });
      continue;
    }
    if (p.type === "board") continue;
    if (!nl.isWired(p.id)) {
      issues.push({ severity: "info", system: "STRUCTURE", parts: [p.id], message: `${label(nl, p.id)} isn't wired yet.`, why: "A part only does something once current can flow through it.", prompt: "Which pins of this part need to connect to the board?" });
      continue;
    }

    if (p.type === "led") {
      const anode = term(p.id, "anode");
      const cathode = term(p.id, "cathode");
      const aPins = nl.boardPinsOn(nl.netOf(anode));
      const cPins = nl.boardPinsOn(nl.netOf(cathode));
      // Both legs sit directly on board nets → nothing limits the current
      if (aPins.length > 0 && cPins.length > 0) {
        const ohms = (seriesOhms(nl, anode, pins) ?? 0) + (seriesOhms(nl, cathode, pins) ?? 0);
        const ma = Math.round(((5 - 2) / Math.max(ohms, 10)) * 1000);
        issues.push({
          severity: "error",
          system: "ELECTRICAL",
          parts: [p.id],
          message: `${label(nl, p.id)} has no resistor in series — about ${Math.min(ma, 300)} mA would flow through an LED rated for 20 mA.`,
          why: "An LED doesn't limit its own current. Without a resistor it (and the pin) overheat and burn out.",
          prompt: "Ohm's law: what resistor would let only about 15 mA flow from 5 V?",
        });
      }
      const cathodeToPower = cPins.some((n) => pinDef("board", n)?.role === "power");
      const anodeToGround = aPins.some((n) => pinDef("board", n)?.role === "ground");
      if (cathodeToPower || anodeToGround) {
        issues.push({
          severity: "warning",
          system: "ELECTRICAL",
          parts: [p.id],
          message: `${label(nl, p.id)} looks reversed: its cathode (short leg) faces the positive side.`,
          why: "An LED only conducts from anode (+, long leg) to cathode (−, short leg).",
          prompt: "Which leg is longer, and which side of the circuit should it face?",
        });
      }
      if (aPins.some((n) => pinDef("board", n)?.role === "power")) {
        issues.push({
          severity: "info",
          system: "ELECTRICAL",
          parts: [p.id],
          message: `${label(nl, p.id)} is fed from a power pin, so your code can't switch it.`,
          why: "Power pins are always on. Code can only control parts wired to D/A pins.",
          prompt: "If you want code to blink it, which kind of pin should feed it?",
        });
      }
    }

    // Powered parts: check their supply and ground
    for (const pin of def.pins) {
      if (pin.role === "power") {
        const v = netPotential(nl, nl.netOf(term(p.id, pin.name)), pins);
        if (v === undefined) {
          issues.push({ severity: "error", system: "POWER", parts: [p.id], message: `${label(nl, p.id)} pin ${pin.name.toUpperCase()} has no power.`, why: "Sensors, servos and drivers need a supply to work.", prompt: "Which board pin supplies 5 V?" });
        } else if (v < 4.5 && p.type === "servo") {
          issues.push({ severity: "warning", system: "POWER", parts: [p.id], message: `${label(nl, p.id)} gets ${v} V; servos expect about 5 V.`, why: "Too little voltage makes servos weak or jittery.", prompt: "Is there a higher-voltage pin you could use?" });
        }
      }
      if (pin.role === "ground" && p.type !== "board" && netPotential(nl, nl.netOf(term(p.id, pin.name)), pins) !== 0) {
        issues.push({ severity: "error", system: "POWER", parts: [p.id], message: `${label(nl, p.id)} pin ${pin.name.toUpperCase()} isn't connected to GND.`, why: "Current needs a path back. Without ground the part has no complete circuit.", prompt: "Where does current return to the board?" });
      }
    }

    if (p.type === "dc_motor") {
      const direct = ["a", "b"].some((pin) => nl.boardPinsOn(nl.netOf(term(p.id, pin))).some((n) => ["digital", "analog"].includes(pinDef("board", n)?.role || "")));
      if (direct) {
        issues.push({
          severity: "error",
          system: "ELECTRICAL",
          parts: [p.id],
          message: `${label(nl, p.id)} draws about ${def.currentMa} mA but is wired straight to a pin rated for ~20 mA.`,
          why: "A pin carries a decision, not power. The motor would barely move and could damage the board.",
          prompt: "What part sits between a small control signal and a big load?",
        });
      }
    }

    if (def.category === "input" && !isButtonLike(p.type) && p.type !== "ir_sensor") {
      const outPin = def.pins.find((x) => x.role === "signalOut")!;
      const bp = nl.boardPinsOn(nl.netOf(term(p.id, outPin.name)));
      if (bp.length === 0) {
        issues.push({ severity: "warning", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} output isn't connected to a board pin.`, why: "The board can only read a sensor through one of its pins.", prompt: "Which pins can read a voltage between 0 and 5 V?" });
      } else if (!bp.some((n) => pinDef("board", n)?.role === "analog")) {
        issues.push({ severity: "warning", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} gives an analog voltage but is on ${bp.join(", ")}, which can only read HIGH/LOW.`, why: "analogRead works on A0–A5; digital pins only see on/off.", prompt: "Which pins start with A?" });
      }
    }

    if (isButtonLike(p.type)) {
      const pinsA = nl.boardPinsOn(nl.netOf(term(p.id, "a")));
      const pinsB = nl.boardPinsOn(nl.netOf(term(p.id, "b")));
      const sig = [...pinsA, ...pinsB].filter((n) => ["digital", "analog"].includes(pinDef("board", n)?.role || ""));
      const toGnd = [...pinsA, ...pinsB].some((n) => pinDef("board", n)?.role === "ground");
      if (sig.length && toGnd) {
        const num = pinDef("board", sig[0])!.number!;
        const mode = scanCode(code).modes.get(num);
        if (code && mode !== "INPUT_PULLUP") {
          issues.push({
            severity: "warning",
            system: "SOFTWARE",
            parts: [p.id],
            message: `${label(nl, p.id)} connects ${sig[0]} to GND, but ${sig[0]} isn't set to INPUT_PULLUP.`,
            why: "When the button is released the pin is connected to nothing (floating) and reads random values.",
            prompt: `What should pinMode(${num}, …) be so the pin reads HIGH until pressed?`,
          });
        }
      }
    }
  }

  // Code ↔ wiring consistency
  if (code.trim()) {
    const scan = scanCode(code);
    if (!scan.hasSetup || !scan.hasLoop) {
      issues.push({ severity: "error", system: "SOFTWARE", parts: [], message: "The program needs both function setup() and function loop().", why: "setup() runs once at power-on, then loop() runs again and again.", prompt: "Which code should run only once, and which forever?" });
    }
    for (const n of scan.writes) {
      const name = boardPinName(n);
      if (!name) continue;
      const net = nl.netOf(term(board.id, name));
      const used = nl.peers(term(board.id, name)).some((t) => !t.startsWith(`${board.id}.`)) || circuit.parts.some((r) => r.type === "resistor" && (nl.netOf(term(r.id, "a")) === net || nl.netOf(term(r.id, "b")) === net));
      if (!used) {
        issues.push({ severity: "warning", system: "SOFTWARE", parts: [], message: `The code drives ${name}, but nothing is wired to ${name}.`, why: "Writing to an empty pin does nothing you can see.", prompt: `Which part did you mean to control with pin ${n}?` });
      }
      if (scan.modes.get(n) !== "OUTPUT" && !/servoWrite|tone/.test(code)) {
        issues.push({ severity: "warning", system: "SOFTWARE", parts: [], message: `${name} is written but never set with pinMode(${n}, OUTPUT).`, why: "Pins start as inputs; an input pin can't light an LED properly.", prompt: "What should setup() tell the board about this pin?" });
      }
    }
  } else if (circuit.parts.length > 1) {
    issues.push({ severity: "info", system: "SOFTWARE", parts: [], message: "No code yet.", why: "The board does nothing until you program it.", prompt: "What should happen first when the board powers on?" });
  }
  return issues;
}

/**
 * Ordered "what to do next" list computed from the live design (SunRoot's ContextualTutor idea):
 * the first unmet item is the current step. Depth is decided by the learning mode in the UI.
 */
export interface Gap {
  id: string;
  title: string;
  hint: string;
  question: string;
  parts: string[];
}

export function nextGaps(circuit: Circuit, code: string): Gap[] {
  const gaps: Gap[] = [];
  const nl = new Netlist(circuit);
  if (!nl.board) {
    gaps.push({ id: "board", title: "Place a board", hint: "Drag the Starter board onto the bench.", question: "What will run your program?", parts: [] });
    return gaps;
  }
  const issues = checkCircuit(circuit, code);
  for (const p of circuit.parts) {
    if (p.type === "board" || p.type === "resistor") continue;
    if (!nl.isWired(p.id)) {
      gaps.push({ id: `wire-${p.id}`, title: `Wire ${label(nl, p.id)}`, hint: CATALOG_BY_TYPE[p.type]?.description || "", question: "Which board pins does it need?", parts: [p.id] });
    }
  }
  for (const i of issues.filter((x) => x.severity === "error")) {
    gaps.push({ id: `fix-${i.message.slice(0, 30)}`, title: i.message, hint: i.why, question: i.prompt, parts: i.parts });
  }
  const scan = scanCode(code);
  if (!scan.hasSetup || !scan.hasLoop) {
    gaps.push({ id: "code", title: "Write setup() and loop()", hint: "setup() runs once; loop() repeats forever.", question: "What should your loop do each time around?", parts: [] });
  }
  for (const i of issues.filter((x) => x.severity === "warning")) {
    gaps.push({ id: `warn-${i.message.slice(0, 30)}`, title: i.message, hint: i.why, question: i.prompt, parts: i.parts });
  }
  return gaps;
}
