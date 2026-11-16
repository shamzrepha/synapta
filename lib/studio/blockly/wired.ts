import { CATALOG_BY_TYPE, pinDef, type PinDef } from "../circuit/catalog";
import { Netlist, i2cWired, splitTerm, term, type Circuit } from "../circuit/netlist";

/**
 * Inspects a live circuit bench and returns hardware blocks matching the parts physically wired
 * to the microcontroller board (mirroring SunRoot's dynamic hardware-synced Blockly palette).
 */

export type WiredAction =
  | { kind: "digital_out"; partId: string; partType: string; label: string; pinName: string; pinNum: number; pwm: boolean }
  | { kind: "pwm_out"; partId: string; partType: string; label: string; pinName: string; pinNum: number }
  | { kind: "relay"; partId: string; label: string; pinName: string; pinNum: number; activeLow: boolean }
  | { kind: "tone"; partId: string; label: string; pinName: string; pinNum: number }
  | { kind: "servo"; partId: string; label: string; pinName: string; pinNum: number }
  | { kind: "stepper"; partId: string; label: string; pins: [number, number, number, number]; pinNames: [string, string, string, string] }
  | { kind: "oled"; partId: string; label: string }
  | { kind: "button"; partId: string; label: string; pinName: string; pinNum: number }
  | { kind: "analog_in"; partId: string; label: string; pinName: string; pinNum: number }
  | { kind: "digital_in"; partId: string; label: string; pinName: string; pinNum: number }
  | { kind: "ultrasonic"; partId: string; label: string; trigPin: number; trigName: string; echoPin: number; echoName: string }
  | { kind: "dht11"; partId: string; label: string; pinName: string; pinNum: number }
  | { kind: "mpu6050"; partId: string; label: string };

export interface WiredHardware {
  hasBoard: boolean;
  actions: WiredAction[];
}

const PASSIVE_BRIDGE_PINS: Record<string, [string, string]> = {
  resistor: ["a", "b"],
  bulb: ["a", "b"],
  ammeter: ["in", "out"],
};

/**
 * Finds board signal pins (`D2–D13`, `A0–A5`) reachable from `startTerm`, walking directly wired
 * nets as well as two-terminal series parts such as a current-limiting resistor on an LED.
 */
function traceBoardSignalPins(nl: Netlist, startTerm: string): PinDef[] {
  if (!nl.board || !nl.valid(startTerm)) return [];
  const seenNets = new Set<string>();
  const queue = [nl.netOf(startTerm)];
  const found = new Map<string, PinDef>();

  while (queue.length) {
    const net = queue.shift()!;
    if (seenNets.has(net)) continue;
    seenNets.add(net);

    for (const name of nl.boardPinsOn(net)) {
      const def = pinDef("board", name);
      if (def && def.number !== undefined) found.set(def.name, def);
    }

    for (const peer of nl.wiredTerms) {
      if (nl.netOf(peer) !== net) continue;
      const { part } = splitTerm(peer);
      const p = nl.partsById.get(part);
      if (!p) continue;
      const pair = PASSIVE_BRIDGE_PINS[p.type];
      if (!pair) continue;
      for (const side of pair) {
        const otherNet = nl.netOf(term(p.id, side));
        if (!seenNets.has(otherNet)) queue.push(otherNet);
      }
    }
  }

  return Array.from(found.values()).sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
}

function defaultLabel(type: string, props?: Record<string, string | number>): string {
  switch (type) {
    case "led": {
      const col = String(props?.color || "red");
      return `${col.charAt(0).toUpperCase()}${col.slice(1)} LED`;
    }
    case "buzzer":
      return "Buzzer";
    case "servo":
      return "Servo";
    case "relay":
      return "Relay";
    case "button":
      return "Button";
    case "switch":
      return "Switch";
    case "potentiometer":
      return "Knob";
    case "light_sensor":
      return "Light sensor";
    case "temp_sensor":
      return "Temp sensor";
    case "ir_sensor":
      return "Line sensor";
    case "hc_sr04":
      return "Ultrasonic";
    case "dht11":
      return "DHT11";
    case "mpu6050":
      return "MPU-6050";
    case "oled":
      return "OLED";
    case "stepper":
      return "Stepper";
    case "motor_driver":
      return "Motor driver";
    case "l298n":
      return "L298N";
    case "tb6612":
      return "TB6612";
    default:
      return CATALOG_BY_TYPE[type]?.name.replace(/ \(.*\)/, "") || type;
  }
}

export function discoverWiredHardware(circuit?: Circuit | null): WiredHardware {
  if (!circuit || !circuit.parts.length) return { hasBoard: false, actions: [] };
  const nl = new Netlist(circuit);
  if (!nl.board) return { hasBoard: false, actions: [] };

  const actions: WiredAction[] = [];

  for (const p of circuit.parts) {
    if (p.type === "board") continue;
    const label = p.label?.trim() || defaultLabel(p.type, p.props);

    switch (p.type) {
      case "led": {
        const pins = traceBoardSignalPins(nl, term(p.id, "anode"));
        const sig = pins.length ? pins : traceBoardSignalPins(nl, term(p.id, "cathode"));
        for (const pin of sig) {
          actions.push({ kind: "digital_out", partId: p.id, partType: p.type, label, pinName: pin.name, pinNum: pin.number!, pwm: !!pin.pwm });
        }
        break;
      }
      case "buzzer": {
        const pins = traceBoardSignalPins(nl, term(p.id, "pos"));
        const sig = pins.length ? pins : traceBoardSignalPins(nl, term(p.id, "neg"));
        for (const pin of sig) {
          actions.push({ kind: "tone", partId: p.id, label, pinName: pin.name, pinNum: pin.number! });
        }
        break;
      }
      case "servo": {
        for (const pin of traceBoardSignalPins(nl, term(p.id, "signal"))) {
          actions.push({ kind: "servo", partId: p.id, label, pinName: pin.name, pinNum: pin.number! });
        }
        break;
      }
      case "relay": {
        const activeLow = Number(p.props?.activeLow ?? 1) === 1;
        for (const pin of traceBoardSignalPins(nl, term(p.id, "in"))) {
          actions.push({ kind: "relay", partId: p.id, label, pinName: pin.name, pinNum: pin.number!, activeLow });
        }
        break;
      }
      case "motor_driver": {
        for (const pin of traceBoardSignalPins(nl, term(p.id, "in"))) {
          if (pin.pwm) actions.push({ kind: "pwm_out", partId: p.id, partType: p.type, label, pinName: pin.name, pinNum: pin.number! });
          else actions.push({ kind: "digital_out", partId: p.id, partType: p.type, label, pinName: pin.name, pinNum: pin.number!, pwm: false });
        }
        break;
      }
      case "l298n": {
        for (const ctl of ["ena", "in1", "in2", "in3", "in4", "enb"] as const) {
          for (const pin of traceBoardSignalPins(nl, term(p.id, ctl))) {
            const pinLabel = `${label} ${ctl.toUpperCase()}`;
            if ((ctl === "ena" || ctl === "enb") && pin.pwm) {
              actions.push({ kind: "pwm_out", partId: p.id, partType: p.type, label: pinLabel, pinName: pin.name, pinNum: pin.number! });
            } else {
              actions.push({ kind: "digital_out", partId: p.id, partType: p.type, label: pinLabel, pinName: pin.name, pinNum: pin.number!, pwm: !!pin.pwm });
            }
          }
        }
        break;
      }
      case "tb6612": {
        for (const ctl of ["pwma", "ain1", "ain2", "bin1", "bin2", "pwmb", "stby"] as const) {
          for (const pin of traceBoardSignalPins(nl, term(p.id, ctl))) {
            const pinLabel = `${label} ${ctl.toUpperCase()}`;
            if ((ctl === "pwma" || ctl === "pwmb") && pin.pwm) {
              actions.push({ kind: "pwm_out", partId: p.id, partType: p.type, label: pinLabel, pinName: pin.name, pinNum: pin.number! });
            } else {
              actions.push({ kind: "digital_out", partId: p.id, partType: p.type, label: pinLabel, pinName: pin.name, pinNum: pin.number!, pwm: !!pin.pwm });
            }
          }
        }
        break;
      }
      case "stepper": {
        const coils = (["in1", "in2", "in3", "in4"] as const).map((c) => traceBoardSignalPins(nl, term(p.id, c))[0]);
        if (coils.every(Boolean)) {
          actions.push({
            kind: "stepper",
            partId: p.id,
            label,
            pins: [coils[0].number!, coils[1].number!, coils[2].number!, coils[3].number!],
            pinNames: [coils[0].name, coils[1].name, coils[2].name, coils[3].name],
          });
        }
        break;
      }
      case "oled": {
        if (i2cWired(nl, p.id)) actions.push({ kind: "oled", partId: p.id, label });
        break;
      }
      case "button":
      case "switch": {
        const seen = new Set<number>();
        for (const side of ["a", "b"] as const) {
          for (const pin of traceBoardSignalPins(nl, term(p.id, side))) {
            if (seen.has(pin.number!)) continue;
            seen.add(pin.number!);
            actions.push({ kind: "button", partId: p.id, label, pinName: pin.name, pinNum: pin.number! });
          }
        }
        break;
      }
      case "potentiometer": {
        for (const pin of traceBoardSignalPins(nl, term(p.id, "wiper"))) {
          actions.push({ kind: pin.number! >= 14 ? "analog_in" : "digital_in", partId: p.id, label, pinName: pin.name, pinNum: pin.number! });
        }
        break;
      }
      case "light_sensor":
      case "temp_sensor":
      case "ir_sensor": {
        for (const pin of traceBoardSignalPins(nl, term(p.id, "out"))) {
          actions.push({ kind: pin.number! >= 14 ? "analog_in" : "digital_in", partId: p.id, label, pinName: pin.name, pinNum: pin.number! });
        }
        break;
      }
      case "hc_sr04": {
        const trig = traceBoardSignalPins(nl, term(p.id, "trig"))[0];
        const echo = traceBoardSignalPins(nl, term(p.id, "echo"))[0];
        if (trig && echo) {
          actions.push({
            kind: "ultrasonic",
            partId: p.id,
            label,
            trigPin: trig.number!,
            trigName: trig.name,
            echoPin: echo.number!,
            echoName: echo.name,
          });
        }
        break;
      }
      case "dht11": {
        for (const pin of traceBoardSignalPins(nl, term(p.id, "data"))) {
          actions.push({ kind: "dht11", partId: p.id, label, pinName: pin.name, pinNum: pin.number! });
        }
        break;
      }
      case "mpu6050": {
        if (i2cWired(nl, p.id)) actions.push({ kind: "mpu6050", partId: p.id, label });
        break;
      }
    }
  }

  return { hasBoard: true, actions };
}
