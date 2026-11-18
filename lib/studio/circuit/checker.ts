import { CATALOG_BY_TYPE, boardPinName, pinDef, isButtonLike } from "./catalog";
import { LED_MAX_MA, Netlist, emptyPinState, evaluateOutputs, splitTerm, type OutputState, i2cWired, netPotential, scanCode, term, type Circuit, type PinState } from "./netlist";

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


/** Nets joined by a part other than `skip`, ignoring sources (battery) when `withSources` is false. */
function adjacency(nl: Netlist, skip: string, withSources: boolean): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    adj.set(a, (adj.get(a) || new Set()).add(b));
    adj.set(b, (adj.get(b) || new Set()).add(a));
  };
  for (const q of nl.circuit.parts) {
    if (q.id === skip) continue;
    const pair: Record<string, [string, string]> = {
      resistor: ["a", "b"], bulb: ["a", "b"], dc_motor: ["a", "b"], led: ["anode", "cathode"], buzzer: ["pos", "neg"], ammeter: ["in", "out"],
      ...(withSources ? { battery: ["plus", "minus"] as [string, string] } : {}),
    };
    const pr = pair[q.type];
    if (pr) link(nl.netOf(term(q.id, pr[0])), nl.netOf(term(q.id, pr[1])));
  }
  return adj;
}

function reachable(adj: Map<string, Set<string>>, from: string, to: string): boolean {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === to) return true;
    for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
  }
  return false;
}

/** How many terminals of OTHER parts sit on the net of `t`. */
function otherTerms(nl: Netlist, t: string): string[] {
  const me = splitTerm(t).part;
  return nl.peers(t).filter((x) => splitTerm(x).part !== me && nl.termWired(x));
}

function ammeterInParallel(nl: Netlist, id: string): boolean {
  const inN = nl.netOf(term(id, "in"));
  const outN = nl.netOf(term(id, "out"));
  return nl.termWired(term(id, "in")) && nl.termWired(term(id, "out")) && inN !== outN && reachable(adjacency(nl, id, false), inN, outN);
}

/** Ammeters must sit in series and voltmeters across a part; say so with the numbers when they don't. */
function meterIssues(nl: Netlist, circuit: Circuit, out: Record<string, OutputState>): Issue[] {
  const issues: Issue[] = [];
  for (const p of circuit.parts) {
    if (p.type === "ammeter" && nl.termWired(term(p.id, "in")) && nl.termWired(term(p.id, "out"))) {
      if (ammeterInParallel(nl, p.id)) {
        const mA = Math.round(Math.abs(out[p.id]?.currentMa ?? 0));
        issues.push({ severity: "error", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} is wired in parallel with a part: it has only 0.05 Ω, so it would carry about ${mA} mA and bypass that part.`, why: "An ammeter measures the current that passes THROUGH it, so it has to be in series, in the loop.", prompt: "Which wire could you cut so all of the current has to go through the ammeter?" });
      }
    }
    if (p.type === "voltmeter" && nl.termWired(term(p.id, "plus")) && nl.termWired(term(p.id, "minus"))) {
      const a = otherTerms(nl, term(p.id, "plus"));
      const b = otherTerms(nl, term(p.id, "minus"));
      if (a.length === 1 && b.length === 1 && splitTerm(a[0]).part !== splitTerm(b[0]).part && !nl.connected(a[0], b[0])) {
        issues.push({ severity: "error", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} is wired in series: its 10 MΩ resistance lets less than 0.001 mA through, so the rest of the loop gets about 0 mA.`, why: "A voltmeter has huge resistance. It must go ACROSS (in parallel with) the part you measure, not in the loop.", prompt: "Which two points should the voltmeter's probes touch to read the drop across the part?" });
      }
    }
  }
  return issues;
}

/** The plain-language verdict (with numbers) for a part whose live state shows a fault, or null when it is fine. */
export function faultIssue(nl: Netlist, p: Circuit["parts"][number], st: OutputState | undefined): Issue | null {
  if (!st) return null;
  const mA = Math.round(Math.abs(st.currentMa ?? 0));
  if (p.type === "battery" && st.fault === "short") {
    const volts = Number(p.props?.volts ?? 6);
    return ({ severity: "error", system: "POWER", parts: [p.id], message: `Short circuit: ${label(nl, p.id)} (${volts} V) would push about ${(mA / 1000).toFixed(1)} A through almost 0 Ω. The wires and battery would overheat.`, why: "Current is flowing from battery + to − with almost zero resistance, so Ohm's law (I = V / R) gives a huge current.", prompt: "What load or resistor is missing in this loop?" });
  } else if (p.type === "ammeter" && st.fault === "short" && !ammeterInParallel(nl, p.id)) {
    return ({ severity: "error", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} would carry about ${(mA / 1000).toFixed(1)} A: it acts like a wire (0.05 Ω) across the supply.`, why: "An ammeter has almost no resistance, so it only belongs in series with the load, never straight across a source.", prompt: "Which wire should you break so the current has to pass through the ammeter?" });
  } else if (p.type === "led" && st.fault === "overcurrent") {
    const limit = LED_MAX_MA;
    return ({ severity: "error", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} current would be ${mA} mA, its limit is ${limit} mA, so it burns out (add or enlarge the series resistor).`, why: "An LED doesn't limit its own current: I = (V − Vf) / R. Add or enlarge a series resistor.", prompt: "Ohm's law: what resistor lets only about 15 mA flow from this supply?" });
  } else if (st.fault === "reversed") {
    return ({ severity: "error", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} is wired backwards, so 0 mA flows and it stays dark.`, why: "Current only lights an LED from anode (+) to cathode (−).", prompt: "Which leg is the anode (+)?" });
  } else if (p.type === "bulb" && st?.fault === "overvoltage") {
    const maxV = Number(p.props?.maxVolts ?? 9);
    return ({ severity: "error", system: "POWER", parts: [p.id], message: `${label(nl, p.id)} gets ${(st.volts ?? 0).toFixed(1)} V, its limit is ${maxV} V, so the filament burned out.`, why: "Lower the battery voltage or add a series resistor to share the voltage drop.", prompt: "How could you lower the voltage across the bulb?" });
  } else if (st.fault === "overvoltage") {
    return ({ severity: "warning", system: "POWER", parts: [p.id], message: `${label(nl, p.id)} is above its safe voltage (${(st.volts ?? 0).toFixed(1)} V) and burned out.`, why: "Lower the battery voltage or add a series resistor to share the voltage drop.", prompt: "How could you lower the voltage across the bulb?" });
  }
  return null;
}

/** Faults visible in the live outputs (e.g. after a switch is closed), ready to show as warnings. */
export function liveFaultIssues(circuit: Circuit, outputs: Record<string, OutputState>): Issue[] {
  const nl = new Netlist(circuit);
  const out: Issue[] = [];
  for (const p of circuit.parts) {
    const f = faultIssue(nl, p, outputs[p.id]);
    if (f) out.push(f);
  }
  out.push(...meterIssues(nl, circuit, outputs));
  return out;
}

export function checkCircuit(circuit: Circuit, code = ""): Issue[] {
  const nl = new Netlist(circuit);
  const issues: Issue[] = [];
  const pins = staticPins(code);
  const boards = circuit.parts.filter((p) => p.type === "board");
  const batteries = circuit.parts.filter((p) => p.type === "battery");

  if (boards.length === 0) {
    if (batteries.length === 0) {
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
    // Pure DC electronics wire circuit (battery without a microcontroller board)
    const out = evaluateOutputs(nl, pins);
    for (const p of circuit.parts) {
      if (p.type === "resistor") continue;
      if (!nl.isWired(p.id)) {
        issues.push({ severity: "warning", system: "STRUCTURE", parts: [p.id], message: `${label(nl, p.id)} isn't wired into the circuit yet.`, why: "An unconnected part has no complete path for current.", prompt: "Where should its wires connect?" });
      }
      if (["oled", "dht11", "mpu6050", "servo", "stepper", "hc_sr04", "ir_sensor", "l298n", "tb6612"].includes(p.type)) {
        issues.push({ severity: "warning", system: "STRUCTURE", parts: [p.id], message: `${label(nl, p.id)} needs a Starter board and code to operate.`, why: "Sensors, drivers, displays and servos speak over signals from a microcontroller.", prompt: "Should this circuit include a Starter board?" });
      }
      const f = faultIssue(nl, p, out[p.id]);
      if (f) issues.push(f);
    }
    issues.push(...meterIssues(nl, circuit, out));
    const bat = batteries.find((b) => nl.isWired(b.id));
    if (bat && !issues.some((i) => i.severity === "error")) {
      const bi = Math.abs(out[bat.id]?.currentMa ?? 0);
      if (bi < 0.5 && circuit.parts.some((q) => !["battery", "voltmeter"].includes(q.type) && nl.isWired(q.id))) {
        issues.push({ severity: "info", system: "STRUCTURE", parts: [bat.id], message: `0 mA flows: the loop from battery + to − is open somewhere (or a switch is off).`, why: "Current needs a complete closed path. One gap stops it everywhere in a series loop.", prompt: "Follow the wire from + around to −. Where does it break?" });
      }
    }
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
      if (pin.role === "power" && p.type === "battery") continue;
      if (pin.role === "power" && p.type === "l298n" && pin.name === "v5" && Number(p.props?.jumper5v ?? 0) === 1) continue;
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

    if (p.type === "tb6612" && !nl.termWired(term(p.id, "stby"))) {
      issues.push({ severity: "warning", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} STBY isn't connected.`, why: "TB6612FNG's STBY pin has a pull-down: unless it is driven HIGH the driver stays in standby and the motors never move (SparkFun hookup guide).", prompt: "Which pin or rail should keep STBY HIGH?" });
    }
    if (p.type === "l298n") {
      const vsV = netPotential(nl, nl.netOf(term(p.id, "vs")), pins);
      if (vsV !== undefined && vsV < 5) issues.push({ severity: "warning", system: "POWER", parts: [p.id], message: `${label(nl, p.id)} gets only ${vsV} V on VS. The L298 drops 2–3 V across the bridge, so the motors would barely turn.`, why: "ST's datasheet: total saturation drop is 1.8–3.2 V at 1 A. The motor only receives what's left.", prompt: "How many volts does the motor need, and how many does the bridge keep for itself?" });
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

    if ((p.type === "oled" || p.type === "mpu6050") && !i2cWired(nl, p.id)) {
      issues.push({ severity: "error", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} needs SDA on A4 and SCL on A5.`, why: "The Uno's hardware I2C bus is on A4 (SDA) and A5 (SCL) (Arduino UNO R3 datasheet); the code library can only talk on those pins.", prompt: "Which two board pins carry the I2C data and clock lines?" });
    }
    if (p.type === "dht11" && nl.boardPinsOn(nl.netOf(term(p.id, "data"))).filter((n) => pinDef("board", n)?.role === "digital").length === 0) {
      issues.push({ severity: "warning", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} DATA isn't on a digital pin.`, why: "The DHT11 answers on a single wire, so its DATA pin has to reach a board pin the code reads with dhtTemperature(pin).", prompt: "Which pin number will you pass to dhtTemperature()?" });
    }
    if (p.type === "relay" && !nl.termWired(term(p.id, "in"))) {
      issues.push({ severity: "warning", system: "ELECTRICAL", parts: [p.id], message: `${label(nl, p.id)} IN isn't connected, so the coil never switches.`, why: "The module's IN pin is how the board tells the relay to energise (the coil needs ≥ 3.75 V, SRD datasheet).", prompt: "Which board pin should control the relay?" });
    }
    if (def.category === "input" && !isButtonLike(p.type) && !["ir_sensor", "hc_sr04", "dht11", "mpu6050"].includes(p.type)) {
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
  issues.push(...meterIssues(nl, circuit, evaluateOutputs(nl, pins)));
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
  const hasBattery = circuit.parts.some((p) => p.type === "battery");
  if (!nl.board && !hasBattery) {
    gaps.push({ id: "board", title: "Place a board", hint: "Drag the Starter board onto the bench.", question: "What will run your program?", parts: [] });
    return gaps;
  }
  const issues = checkCircuit(circuit, code);
  for (const p of circuit.parts) {
    if (p.type === "board" || p.type === "resistor") continue;
    if (!nl.isWired(p.id)) {
      gaps.push({ id: `wire-${p.id}`, title: `Wire ${label(nl, p.id)}`, hint: CATALOG_BY_TYPE[p.type]?.description || "", question: nl.board ? "Which board pins does it need?" : "Which loop should it join?", parts: [p.id] });
    }
  }
  for (const i of issues.filter((x) => x.severity === "error")) {
    gaps.push({ id: `fix-${i.message.slice(0, 30)}`, title: i.message, hint: i.why, question: i.prompt, parts: i.parts });
  }
  if (nl.board) {
    const scan = scanCode(code);
    if (!scan.hasSetup || !scan.hasLoop) {
      gaps.push({ id: "code", title: "Write setup() and loop()", hint: "setup() runs once; loop() repeats forever.", question: "What should your loop do each time around?", parts: [] });
    }
  }
  for (const i of issues.filter((x) => x.severity === "warning")) {
    gaps.push({ id: `warn-${i.message.slice(0, 30)}`, title: i.message, hint: i.why, question: i.prompt, parts: i.parts });
  }
  return gaps;
}
