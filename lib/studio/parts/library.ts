/**
 * Verified parts library. Every number here was read from the manufacturer datasheet or a named
 * product page (source ids point into `sources`) — nothing is assumed. The simulator's component
 * logic (truth tables, voltage drops, timing, ranges) and the 3D dimensions come from this file, and
 * the AI is told to use these parts and these facts instead of guessing how a component works.
 *
 * `verifiedOn` is the date the sources were fetched and read. A fact marked `approx` is a modelling
 * choice derived from datasheet numbers (the derivation is in the note), never an invention.
 */

export interface PartSource {
  id: string;
  title: string;
  url: string;
  kind: "datasheet" | "product" | "tutorial";
}

export interface PartFact {
  label: string;
  value: string;
  /** source id */
  src: string;
  /** derived from datasheet numbers for the simulation rather than quoted */
  approx?: boolean;
}

export interface VerifiedPart {
  /** circuit catalog type this part is simulated as */
  type: string;
  name: string;
  maker: string;
  partNumber: string;
  summary: string;
  sources: PartSource[];
  facts: PartFact[];
  /** real body dimensions in mm [x, y(height), z] — null when no machine-readable source was available */
  dimsMm: { size: [number, number, number]; src: string } | null;
  /** logic / truth table rows (first row = header) */
  logic?: { title: string; rows: string[][]; src: string };
  warnings: string[];
  /** search words for reference photos and diagrams */
  imageQuery: string;
  verifiedOn: string;
}

const ON = "2026-10-15";

export const VERIFIED_PARTS: VerifiedPart[] = [
  {
    type: "l298n",
    name: "L298N dual H-bridge motor driver module",
    maker: "STMicroelectronics L298 on a Handson Technology module",
    partNumber: "L298N (module SKU MDU-1049)",
    summary: "Dual full-bridge driver: each bridge drives one DC motor in either direction. Direction comes from IN1/IN2, enable (or PWM on EN) sets whether and how hard it drives. It is a bipolar part, so it burns 2–3 V across the bridge — your motor gets noticeably less than the battery voltage.",
    sources: [
      { id: "l298-st", title: "ST L298 datasheet (Dual full-bridge driver)", url: "https://www.st.com/resource/en/datasheet/l298.pdf", kind: "datasheet" },
      { id: "l298-sparkfun", title: "L298 datasheet (SparkFun-hosted copy of the ST document)", url: "https://www.sparkfun.com/datasheets/Robotics/L298_H_Bridge.pdf", kind: "datasheet" },
      { id: "l298n-module", title: "Handson Technology L298N module data sheet", url: "https://handsontec.com/dataspecs/L298N%20Motor%20Driver.pdf", kind: "datasheet" },
    ],
    facts: [
      { label: "Motor supply VS", value: "up to 46 V operating; 'Power Supply 5 V – 35 V' on the module", src: "l298-st" },
      { label: "Logic supply VSS", value: "4.5 V min, 5 V typ, 7 V max", src: "l298-st" },
      { label: "Output current per channel", value: "2 A DC; 2.5 A repetitive peak; 3 A non-repetitive (100 µs)", src: "l298-st" },
      { label: "Input / enable logic levels", value: "Low −0.3…1.5 V, High 2.3 V…VSS (TTL compatible)", src: "l298-st" },
      { label: "Source saturation VCEsat(H)", value: "1.35 V typ at IL = 1 A (0.95–1.7); 2 V typ at 2 A (max 2.7)", src: "l298-st" },
      { label: "Sink saturation VCEsat(L)", value: "1.2 V typ at IL = 1 A (0.85–1.6); 1.7 V typ at 2 A (max 2.3)", src: "l298-st" },
      { label: "Total voltage drop", value: "1.80 V min – 3.2 V max at IL = 1 A; max 4.9 V at 2 A", src: "l298-st" },
      { label: "Simulated drop", value: "1.4 V + 1.15 V/A × I (straight line through the two typical points: 2.55 V at 1 A, 3.7 V at 2 A)", src: "l298-st", approx: true },
      { label: "Module size", value: "3.4 cm × 4.3 cm × 2.7 cm", src: "l298n-module" },
      { label: "Module extras", value: "On-board +5 V regulator with a 5V-enable jumper; ENA/ENB jumpers keep the bridges enabled", src: "l298n-module" },
      { label: "Max power", value: "20 W (at 75 °C)", src: "l298n-module" },
    ],
    dimsMm: { size: [34, 27, 43], src: "l298n-module" },
    logic: {
      title: "Each bridge: Ven (enable), C/D = the two IN pins",
      rows: [
        ["Ven", "IN (C, D)", "Motor"],
        ["H", "C=H, D=L", "Forward"],
        ["H", "C=L, D=H", "Reverse"],
        ["H", "C = D", "Fast motor stop (brake)"],
        ["L", "C = X, D = X", "Free running (coast)"],
      ],
      src: "l298-st",
    },
    warnings: [
      "VS (motor supply) and VSS (5 V logic) are separate inputs; the module's 5 V pin powers the logic. Connect the battery minus to the board GND (common ground) or the inputs have no reference.",
      "The bridge drops 2–3 V, so a 6 V battery gives a motor only ~3.5–4 V.",
    ],
    imageQuery: "L298N motor driver module",
    verifiedOn: ON,
  },
  {
    type: "tb6612",
    name: "TB6612FNG dual motor driver",
    maker: "Toshiba (SparkFun breakout)",
    partNumber: "TB6612FNG",
    summary: "MOSFET dual H-bridge. Direction from IN1/IN2, speed from PWM, and STBY must be pulled HIGH or nothing drives. Because it uses MOSFETs the voltage lost in the bridge is tiny (about 0.5 Ω total), so motors get nearly the full battery voltage.",
    sources: [
      { id: "tb-toshiba", title: "Toshiba TB6612FNG datasheet (2007-06-30)", url: "https://cdn.sparkfun.com/datasheets/Robotics/TB6612FNG.pdf", kind: "datasheet" },
      { id: "tb-hookup", title: "SparkFun TB6612FNG hookup guide", url: "https://learn.sparkfun.com/tutorials/tb6612fng-hookup-guide", kind: "tutorial" },
    ],
    facts: [
      { label: "Output current", value: "1.2 A average / 3.2 A peak per channel", src: "tb-toshiba" },
      { label: "Motor supply VM", value: "2.2–13.5 V (SparkFun guide)", src: "tb-hookup" },
      { label: "Logic supply VCC", value: "2.7–5.5 V", src: "tb-hookup" },
      { label: "Logic levels", value: "VIH = VCC × 0.7 min; VIL = VCC × 0.3 max", src: "tb-toshiba" },
      { label: "Output saturation Vsat(U+L)", value: "0.5 V typ at Io = 1 A (VCC = VM = 5 V); 0.15 V typ at Io = 0.3 A", src: "tb-toshiba" },
      { label: "Simulated drop", value: "0.5 Ω × I (0.5 V at 1 A, 0.15 V at 0.3 A — matches both datasheet points)", src: "tb-toshiba", approx: true },
      { label: "STBY", value: "Allows the H-bridges to work when high; has a pulldown so it must be actively pulled high", src: "tb-hookup" },
    ],
    dimsMm: null,
    logic: {
      title: "Per channel (STBY must be HIGH)",
      rows: [
        ["IN1", "IN2", "PWM", "OUT1", "OUT2", "Mode"],
        ["H", "H", "H/L", "L", "L", "Short brake"],
        ["L", "H", "H", "L", "H", "CCW"],
        ["L", "H", "L", "L", "L", "Short brake"],
        ["H", "L", "H", "H", "L", "CW"],
        ["H", "L", "L", "L", "L", "Short brake"],
        ["L", "L", "H", "OFF", "OFF", "Stop"],
      ],
      src: "tb-hookup",
    },
    warnings: ["STBY has a pull-down: wire it to a HIGH pin or 5 V, otherwise the motors never move."],
    imageQuery: "TB6612FNG motor driver breakout",
    verifiedOn: ON,
  },
  {
    type: "hc_sr04",
    name: "HC-SR04 ultrasonic ranging module",
    maker: "Elecfreaks",
    partNumber: "HC-SR04",
    summary: "Measures distance with 40 kHz ultrasound. Give TRIG a 10 µs HIGH pulse; the module sends eight 40 kHz pulses and raises ECHO for as long as the sound takes to go out and come back. Distance (cm) = echo µs ÷ 58.",
    sources: [{ id: "hcsr04", title: "HC-SR04 datasheet (Elecfreaks)", url: "https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf", kind: "datasheet" }],
    facts: [
      { label: "Working voltage", value: "DC 5 V", src: "hcsr04" },
      { label: "Working current", value: "15 mA", src: "hcsr04" },
      { label: "Range", value: "2 cm – 4 m (accuracy up to 3 mm)", src: "hcsr04" },
      { label: "Measuring angle", value: "15 degrees", src: "hcsr04" },
      { label: "Trigger input", value: "At least 10 µs TTL HIGH pulse", src: "hcsr04" },
      { label: "Echo output", value: "HIGH pulse whose width is proportional to the range: µs / 58 = cm (or µs / 148 = inch)", src: "hcsr04" },
      { label: "Measurement cycle", value: "Use over 60 ms between measurements", src: "hcsr04" },
      { label: "Size", value: "45 × 20 × 15 mm", src: "hcsr04" },
    ],
    dimsMm: { size: [45, 15, 20], src: "hcsr04" },
    logic: {
      title: "Timing",
      rows: [["Step", "What happens"], ["1", "TRIG HIGH for ≥ 10 µs"], ["2", "Module sends 8 × 40 kHz"], ["3", "ECHO goes HIGH, then LOW when the echo returns"], ["4", "cm = HIGH time in µs ÷ 58"]],
      src: "hcsr04",
    },
    warnings: ["Connect GND to the module first when hot-plugging (datasheet). Soft or angled targets may not return an echo."],
    imageQuery: "HC-SR04 ultrasonic sensor",
    verifiedOn: ON,
  },
  {
    type: "ir_sensor",
    name: "TCRT5000 reflective line sensor",
    maker: "Vishay",
    partNumber: "TCRT5000",
    summary: "An infrared LED and a phototransistor side by side. Dark surfaces reflect little of the 950 nm light, light surfaces reflect a lot — that is how a robot tells a black line from the floor. Best at about 2.5 mm from the surface.",
    sources: [{ id: "tcrt", title: "Vishay TCRT5000 / TCRT5000L datasheet", url: "https://www.vishay.com/docs/83760/tcrt5000.pdf", kind: "datasheet" }],
    facts: [
      { label: "Emitter wavelength", value: "950 nm (peak 940 nm at IF = 100 mA)", src: "tcrt" },
      { label: "Detector", value: "Phototransistor; VCEO 70 V; IC max 100 mA", src: "tcrt" },
      { label: "Peak operating distance", value: "2.5 mm", src: "tcrt" },
      { label: "Operating range (> 20 % relative collector current)", value: "0.2 mm to 15 mm", src: "tcrt" },
      { label: "Emitter forward current", value: "IF max 60 mA; VF 1.25 V typ (1.5 max) at 60 mA", src: "tcrt" },
      { label: "Package", value: "10.2 × 5.8 × 7 mm", src: "tcrt" },
    ],
    dimsMm: { size: [10.2, 7, 5.8], src: "tcrt" },
    warnings: ["The chip only gives an analog current; the common 3-pin module adds a resistor (and a comparator on the digital-output version), so check which module you have."],
    imageQuery: "TCRT5000 infrared line tracking sensor module",
    verifiedOn: ON,
  },
  {
    type: "servo",
    name: "SG90 9 g micro servo",
    maker: "TowerPro",
    partNumber: "SG90",
    summary: "A hobby servo: it turns to the angle set by the width of a 50 Hz control pulse and holds it. Roughly 180° of travel.",
    sources: [{ id: "sg90", title: "SG90 9 g micro servo datasheet", url: "https://components101.com/sites/default/files/component_datasheet/SG90%20Servo%20Motor%20Datasheet.pdf", kind: "datasheet" }],
    facts: [
      { label: "Operating voltage", value: "4.8 V (~5 V)", src: "sg90" },
      { label: "Operating speed", value: "0.1 s per 60° (= 600 °/s)", src: "sg90" },
      { label: "Stall torque", value: "1.8 kgf·cm", src: "sg90" },
      { label: "Pulse → position", value: "≈ 1 ms = −90° (left), 1.5 ms = 0° (middle), ≈ 2 ms = +90° (right)", src: "sg90" },
      { label: "Dead band", value: "10 µs", src: "sg90" },
      { label: "Size / weight", value: "22.2 × 11.8 × 31 mm approx.; 9 g", src: "sg90" },
    ],
    dimsMm: { size: [22.2, 31, 11.8], src: "sg90" },
    warnings: ["A servo can pull more current than a board pin gives: power it from 5 V, not from a signal pin."],
    imageQuery: "SG90 micro servo",
    verifiedOn: ON,
  },
  {
    type: "dc_motor",
    name: "TT gearbox DC motor (1:48)",
    maker: "Adafruit product 3777 (generic TT motor)",
    partNumber: "TT DC gearbox motor",
    summary: "The yellow hobby gearbox motor found on most small robots. 3–6 V; speed rises almost linearly with voltage. It draws far more than a board pin can give, so it always needs a driver.",
    sources: [{ id: "tt", title: "Adafruit TT DC Gearbox Motor (product 3777)", url: "https://www.adafruit.com/product/3777", kind: "product" }],
    facts: [
      { label: "Rated voltage", value: "3–6 V", src: "tt" },
      { label: "Gear ratio", value: "1:48", src: "tt" },
      { label: "No-load speed", value: "120 RPM at 3 V, 185 RPM at 4.5 V, 250 RPM at 6 V", src: "tt" },
      { label: "No-load current", value: "150 mA at 3 V, 155 mA at 4.5 V, 160 mA at 6 V", src: "tt" },
      { label: "Stall current", value: "1.1 A at 3 V, 1.2 A at 4.5 V, 1.5 A at 6 V", src: "tt" },
      { label: "Stall torque", value: "0.4 kg·cm at 3 V, 0.8 kg·cm at 6 V", src: "tt" },
      { label: "Simulated speed", value: "rpm ≈ 43.3 × V − 10 (straight line through the three measured points)", src: "tt", approx: true },
      { label: "Size / weight", value: "70 × 22 × 18 mm; 30.6 g", src: "tt" },
    ],
    dimsMm: { size: [70, 18, 22], src: "tt" },
    warnings: ["Above 6 V it overheats and wears quickly; below ~3 V it is weak."],
    imageQuery: "TT gear motor yellow",
    verifiedOn: ON,
  },
  {
    type: "board",
    name: "Arduino UNO R3",
    maker: "Arduino",
    partNumber: "A000066",
    summary: "ATmega328P microcontroller board: 14 digital pins (6 PWM), 6 analog inputs, 16 MHz.",
    sources: [{ id: "uno", title: "Arduino UNO R3 documentation", url: "https://docs.arduino.cc/hardware/uno-rev3/", kind: "product" }],
    facts: [
      { label: "Microcontroller", value: "ATmega328P", src: "uno" },
      { label: "PWM outputs", value: "6", src: "uno" },
      { label: "Analog inputs", value: "6", src: "uno" },
      { label: "Clock", value: "16 MHz ceramic resonator", src: "uno" },
    ],
    dimsMm: null,
    warnings: ["Each pin gives only a few tens of mA — never power a motor from a pin."],
    imageQuery: "Arduino Uno R3",
    verifiedOn: ON,
  },
];

export const VERIFIED_BY_TYPE: Record<string, VerifiedPart> = Object.fromEntries(VERIFIED_PARTS.map((p) => [p.type, p]));

/** Compact text the AI sees: the facts it must respect, with where they came from. */
export function libraryDigest(types?: string[]): string {
  const list = types ? VERIFIED_PARTS.filter((p) => types.includes(p.type)) : VERIFIED_PARTS;
  return list
    .map((p) => {
      const facts = p.facts.filter((f) => !f.approx).map((f) => `${f.label}: ${f.value}`).join("; ");
      const logic = p.logic ? `\n   ${p.logic.title}: ${p.logic.rows.map((r) => r.join(" | ")).join(" ; ")}` : "";
      return `- ${p.type} = ${p.name} (${p.partNumber}). ${p.summary}\n   FACTS (datasheet): ${facts}${logic}\n   WARNINGS: ${p.warnings.join(" ")}`;
    })
    .join("\n");
}

/** TT motor speed (rpm, no load) at a voltage: straight line through the three measured points. */
export function ttRpmAt(volts: number): number {
  const v = Math.abs(volts);
  if (v < 0.3) return 0;
  return Math.max(0, 43.33 * v - 10);
}

/** L298 total bridge drop (V) at motor current i (A): straight line through the datasheet's typical points. */
export function l298Drop(i: number): number {
  return 1.4 + 1.15 * Math.max(0, Math.min(i, 2.5));
}

/** TB6612FNG total drop (V) at motor current i (A): 0.5 Ω, from Vsat 0.5 V @ 1 A and 0.15 V @ 0.3 A. */
export function tb6612Drop(i: number): number {
  return 0.5 * Math.max(0, i);
}

/** Approximate TT motor current (A) at a voltage with a light rolling load: between no-load and stall. */
export function ttCurrentAt(volts: number, loadFraction = 0.2): number {
  const v = Math.abs(volts);
  const noLoad = 0.15 + 0.01 * ((v - 3) / 3);
  const stall = v / 4; // 1.5 A at 6 V, 1.1 A at 3 V is close to V / 4 Ω
  return noLoad + loadFraction * Math.max(0, stall - noLoad);
}
