import { parseSpec, type DesignKind, type DesignSpec, type DesignSpecInput } from "./spec";

/**
 * Pre-saved projects: they work with no AI call, and the guided ones start nearly empty so learners
 * build them step by step (checks turn green as they go). The AI can still remix any of them.
 */
export interface Template {
  id: string;
  title: string;
  kind: DesignKind;
  level: "beginner" | "intermediate" | "advanced";
  tags: string[];
  blurb: string;
  /** what learners start from (defaults to the full design) */
  starter?: DesignSpecInput;
  spec: DesignSpecInput;
}

const board = { id: "board", type: "board", x: 60, y: 300 };

const trafficCode = `// Traffic light: red → green → amber, forever
var RED = 13;
var AMBER = 12;
var GREEN = 11;

function setup() {
  pinMode(RED, OUTPUT);
  pinMode(AMBER, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

// Turn each light on (HIGH) or off (LOW), then wait
function light(red, amber, green, ms) {
  digitalWrite(RED, red);
  digitalWrite(AMBER, amber);
  digitalWrite(GREEN, green);
  delay(ms);
}

function loop() {
  light(HIGH, LOW, LOW, 5000);  // stop
  light(LOW, LOW, HIGH, 4000);  // go
  light(LOW, HIGH, LOW, 1500);  // get ready to stop
}
`;

const trafficTest = {
  id: "sequence",
  title: "Lights go red → green → amber (twice)",
  durationMs: 22_000,
  inputs: [],
  expect: { kind: "sequence" as const, parts: ["red", "amber", "green"], states: [[1, 0, 0], [0, 0, 1], [0, 1, 0]] as (0 | 1)[][], minMs: 500, cycles: 2 },
};

const trafficSteps = [
  { id: "s1", title: "Place three LEDs", detail: "Drag a red, an amber and a green LED onto the bench above the board. The long leg is the anode (+).", videoQuery: "how LEDs work anode cathode", check: { kind: "parts" as const, type: "led", min: 3 } },
  { id: "s2", title: "Add a resistor for each LED", detail: "Each LED needs about 220 Ω in series, or it draws too much current and burns out. Ohm's law: (5 V − 2 V) ÷ 220 Ω ≈ 14 mA.", videoQuery: "why does an LED need a resistor", check: { kind: "parts" as const, type: "resistor", min: 3 } },
  { id: "s3", title: "Wire pin → resistor → LED → GND", detail: "Red on D13, amber on D12, green on D11. Each pin goes to a resistor, the resistor to the LED's anode, and the LED's cathode to GND.", videoQuery: "arduino traffic light wiring", check: { kind: "noErrors" as const } },
  { id: "s4", title: "Tell the board which pins are outputs", detail: "In setup(), call pinMode(13, OUTPUT) and the same for 12 and 11.", videoQuery: "arduino pinMode setup loop explained", check: { kind: "code" as const } },
  { id: "s5", title: "Write the light sequence", detail: "In loop(), turn on only red and wait 5 s (delay(5000)), then only green for 4 s, then only amber for 1.5 s. Press Run and watch.", videoQuery: "arduino traffic light code", check: { kind: "test" as const, testId: "sequence" } },
  { id: "s6", title: "Stretch: pedestrian button", detail: "Add a button on D2 (other leg to GND, INPUT_PULLUP). When pressed, finish the green phase early and go to amber.", videoQuery: "arduino pedestrian crossing button", check: { kind: "manual" as const } },
];

const ledPart = (id: string, color: string, x: number) => ({ id, type: "led", label: `${color[0].toUpperCase()}${color.slice(1)} LED`, x, y: 60, props: { color } });
const resPart = (id: string, x: number) => ({ id, type: "resistor", x, y: 180, props: { ohms: 220 } });
const w = (id: string, from: string, to: string, color?: string) => ({ id, from, to, color });

// ClassAir bench unit (from the user's blueprint): sizes in mm, explode offsets pull the stack apart
const CY = "#8fd3ff";
const GOOD = "#9be7c4";
const WARM = "#ff9a7a";
const ELEC = "#b8a6ff";
const WATER = "#7fd0ff";
type N = number | string;
const box = (id: string, name: string, size: [N, N, N], pos: [N, N, N], explode: [number, number, number], color: string, group: string, info: Record<string, string>, opacity = 0.12) => ({
  id,
  name,
  shape: "box" as const,
  size,
  pos,
  explode,
  color,
  group,
  opacity,
  info,
});

export const TEMPLATES: Template[] = [
  {
    id: "traffic-light",
    title: "Traffic light",
    kind: "circuit",
    level: "beginner",
    tags: ["electronics", "arduino", "code", "timing"],
    blurb: "Wire three LEDs and code the red → green → amber cycle. Tested automatically.",
    starter: {
      kind: "circuit",
      summary: "Build a working traffic light controller step by step.",
      circuit: { parts: [board], wires: [] },
      code: "function setup() {\n  // set your three pins as OUTPUT\n}\n\nfunction loop() {\n  // red, then green, then amber\n}\n",
      steps: trafficSteps,
      tests: [trafficTest],
    },
    spec: {
      kind: "circuit",
      summary: "Three LEDs on D13/D12/D11 through 220 Ω resistors, cycling red → green → amber.",
      circuit: {
        parts: [board, ledPart("red", "red", 120), ledPart("amber", "amber", 220), ledPart("green", "green", 320), resPart("r1", 100), resPart("r2", 200), resPart("r3", 300)],
        wires: [
          w("w1", "board.D13", "r1.a", "#ef4444"), w("w2", "r1.b", "red.anode", "#ef4444"), w("w3", "red.cathode", "board.GND", "#111827"),
          w("w4", "board.D12", "r2.a", "#f59e0b"), w("w5", "r2.b", "amber.anode", "#f59e0b"), w("w6", "amber.cathode", "board.GND", "#111827"),
          w("w7", "board.D11", "r3.a", "#22c55e"), w("w8", "r3.b", "green.anode", "#22c55e"), w("w9", "green.cathode", "board.GND2", "#111827"),
        ],
      },
      code: trafficCode,
      steps: trafficSteps,
      tests: [trafficTest],
    },
  },
  {
    id: "blink",
    title: "Blink an LED",
    kind: "circuit",
    level: "beginner",
    tags: ["electronics", "first project"],
    blurb: "The 'hello world' of hardware: one LED, one resistor, on and off every second.",
    spec: {
      kind: "circuit",
      summary: "An LED on D13 blinks once per second.",
      circuit: { parts: [board, ledPart("led", "red", 160), resPart("r1", 140)], wires: [w("w1", "board.D13", "r1.a"), w("w2", "r1.b", "led.anode"), w("w3", "led.cathode", "board.GND", "#111827")] },
      code: "function setup() {\n  pinMode(13, OUTPUT);\n}\n\nfunction loop() {\n  digitalWrite(13, HIGH);\n  delay(1000);\n  digitalWrite(13, LOW);\n  delay(1000);\n}\n",
      steps: [
        { id: "b1", title: "Press Run", detail: "Watch the LED blink. Try changing 1000 to 200 and run again.", videoQuery: "arduino blink explained", check: { kind: "test", testId: "blink" } },
        { id: "b2", title: "Make an SOS", detail: "Three short, three long, three short blinks.", check: { kind: "manual" } },
      ],
      tests: [{ id: "blink", title: "LED blinks on and off", durationMs: 5000, inputs: [], expect: { kind: "sequence", parts: ["led"], states: [[1], [0]], minMs: 300, cycles: 2 } }],
    },
  },
  {
    id: "button-led",
    title: "Button-controlled light",
    kind: "circuit",
    level: "beginner",
    tags: ["electronics", "input", "pull-up"],
    blurb: "Read a push button with INPUT_PULLUP and switch an LED.",
    spec: {
      kind: "circuit",
      summary: "Press the button on D2 to light the LED on D13.",
      circuit: {
        parts: [board, ledPart("led", "green", 160), resPart("r1", 140), { id: "btn", type: "button", label: "Button", x: 360, y: 60 }],
        wires: [w("w1", "board.D13", "r1.a"), w("w2", "r1.b", "led.anode"), w("w3", "led.cathode", "board.GND", "#111827"), w("w4", "board.D2", "btn.a", "#3b82f6"), w("w5", "btn.b", "board.GND2", "#111827")],
      },
      code: "function setup() {\n  pinMode(2, INPUT_PULLUP);  // reads HIGH until pressed\n  pinMode(13, OUTPUT);\n}\n\nfunction loop() {\n  if (digitalRead(2) === LOW) {\n    digitalWrite(13, HIGH);\n  } else {\n    digitalWrite(13, LOW);\n  }\n  delay(10);\n}\n",
      steps: [{ id: "k1", title: "Run, then hold the button", detail: "Hold the button on the bench to press it.", videoQuery: "arduino input pullup button", check: { kind: "test", testId: "press" } }],
      tests: [{ id: "press", title: "LED follows the button", durationMs: 1200, inputs: [{ atMs: 300, part: "btn", value: 1 }, { atMs: 800, part: "btn", value: 0 }], expect: { kind: "at", checks: [{ atMs: 200, part: "led", on: false }, { atMs: 500, part: "led", on: true }, { atMs: 1000, part: "led", on: false }] } }],
    },
  },
  {
    id: "night-light",
    title: "Automatic night light",
    kind: "circuit",
    level: "intermediate",
    tags: ["electronics", "sensor", "analog"],
    blurb: "A light sensor on A0 turns the LED on when it gets dark.",
    spec: {
      kind: "circuit",
      summary: "Reads the light level on A0 and switches the LED on below a threshold.",
      circuit: {
        parts: [board, ledPart("led", "white", 160), resPart("r1", 140), { id: "ldr", type: "light_sensor", label: "Light sensor", x: 380, y: 60, props: { value: 700 } }],
        wires: [w("w1", "board.D9", "r1.a"), w("w2", "r1.b", "led.anode"), w("w3", "led.cathode", "board.GND", "#111827"), w("w4", "ldr.vcc", "board.5V", "#ef4444"), w("w5", "ldr.gnd", "board.GND2", "#111827"), w("w6", "ldr.out", "board.A0", "#a855f7")],
      },
      code: "var DARK = 400;\n\nfunction setup() {\n  pinMode(9, OUTPUT);\n  Serial.begin(9600);\n}\n\nfunction loop() {\n  var light = analogRead(A0);\n  Serial.println(light);\n  digitalWrite(9, light < DARK ? HIGH : LOW);\n  delay(200);\n}\n",
      steps: [{ id: "n1", title: "Run and drag the light slider down", detail: "Below 400 the LED should switch on.", videoQuery: "arduino LDR night light", check: { kind: "test", testId: "dark" } }],
      tests: [{ id: "dark", title: "LED on in the dark, off in daylight", durationMs: 2000, inputs: [{ atMs: 0, part: "ldr", value: 800 }, { atMs: 1000, part: "ldr", value: 150 }], expect: { kind: "at", checks: [{ atMs: 700, part: "led", on: false }, { atMs: 1700, part: "led", on: true }] } }],
    },
  },
  {
    id: "gear-lift",
    title: "Gear reduction winch",
    kind: "mechanism",
    level: "intermediate",
    tags: ["mechanical", "gears", "torque", "challenge"],
    blurb: "A small motor lifts a 2 kg load 1 m. Pick the gear teeth that lift it fastest without stalling.",
    spec: {
      kind: "mechanism",
      summary: "Motor → two gear stages → 10 mm drum → 2 kg load. Too little reduction stalls; too much is slow.",
      mechanism: {
        input: { kind: "motor", stallTorque: 0.05, freeRpm: 6000 },
        module: 2,
        stages: [{ driverTeeth: 12, drivenTeeth: 36 }, { driverTeeth: 12, drivenTeeth: 36 }],
        efficiencyPerStage: 0.95,
        drumRadius: 0.01,
        pulleyAdvantage: 1,
        load: { mass: 2 },
        liftHeight: 1,
        ratchet: true,
      },
      steps: [
        { id: "g1", title: "Find the torque you need", detail: "Holding 2 kg on a 10 mm drum needs m·g·r = 2 × 9.81 × 0.01 ≈ 0.2 N·m. The motor gives only 0.05 N·m, so you need at least 4:1 reduction (plus losses).", videoQuery: "gear ratio torque explained", check: { kind: "lifts" } },
        { id: "g2", title: "Try different teeth", detail: "Gear ratio = driven teeth ÷ driver teeth, multiplied across stages. Run the test after each change and watch the lift time.", videoQuery: "compound gear train explained", check: { kind: "manual" } },
        { id: "g3", title: "Beat 3 seconds", detail: "Find a ratio that lifts the load in under 3 s. Hint: the fastest ratio is about twice the minimum one.", check: { kind: "liftTime", maxSeconds: 3 } },
      ],
    },
  },
  {
    id: "hand-winch",
    title: "Hand-crank well winch",
    kind: "mechanism",
    level: "beginner",
    tags: ["mechanical", "simple machines", "force"],
    blurb: "Lift a 20 kg bucket 3 m by hand. How much push force does your design need?",
    spec: {
      kind: "mechanism",
      summary: "Crank (10 cm handle) → gears → 3 cm drum → bucket. A person can push about 40 N at 60 rpm.",
      mechanism: {
        input: { kind: "crank", crankRadius: 0.1, force: 40, crankRpm: 60 },
        module: 3,
        stages: [{ driverTeeth: 15, drivenTeeth: 45 }],
        efficiencyPerStage: 0.92,
        drumRadius: 0.03,
        pulleyAdvantage: 1,
        load: { mass: 20 },
        liftHeight: 3,
        ratchet: true,
      },
      steps: [
        { id: "h1", title: "Can a person lift it?", detail: "Compare the force needed at the handle with the 40 N a person can push.", videoQuery: "wheel and axle mechanical advantage", check: { kind: "lifts" } },
        { id: "h2", title: "Use less force", detail: "Change gears or add a pulley so it needs under 25 N. What happens to the time?", videoQuery: "pulley mechanical advantage explained", check: { kind: "manual" } },
      ],
    },
  },
  {
    id: "classair",
    title: "ClassAir air filter (3D)",
    kind: "assembly",
    level: "intermediate",
    tags: ["mechanical", "3d", "assembly", "esp32"],
    blurb: "An exploded 3D assembly of a classroom air filter with mist stage, sensors and ESP32.",
    spec: {
      kind: "assembly",
      summary: "Room air enters the side slots, passes the dust sensor, rises through the mist and droplet mesh, then foam, carbon and HEPA-type media, and leaves through the top fan.",
      params: [{ key: "W", label: "Unit width", value: 200, min: 160, max: 320, step: 10, unit: "mm" }],
      parts: [
        box("base", "Base plate", ["W", 6, "W"], [0, 3, 0], [0, -125, 0], CY, "Housing", { where: "Bottom of the unit", fit: "6 mm plywood, MDF or acrylic with four rubber feet.", cost: "in enclosure set" }, 0.18),
        box("inlet", "Inlet chamber", ["W", 80, "W"], [0, 46, 0], [0, -85, 0], CY, "Housing", { where: "On the base plate", fit: "Cut a 120 × 8 mm slot front and back, 45 mm up.", cost: "in enclosure set" }, 0.06),
        box("dust", "GP2Y dust sensor", [46, 18, 30], [-70, 44, -45], [0, -85, 0], ELEC, "Electronics", { where: "Inside the inlet, 25 mm behind the front slot", fit: "Keep it dry — droplets read as dust.", cost: "₦13,500" }, 0.3),
        box("mist", "Mist chamber", ["W", 60, "W"], [0, 116, 0], [0, -45, 0], CY, "Housing", { where: "On top of the inlet chamber", fit: "Perforated floor; 12 mm refill port on the front.", cost: "in enclosure set" }, 0.06),
        box("tray", "Water tray and mist disc", [110, 28, 110], [0, 100, 0], [0, -45, 0], WATER, "Water", { where: "Centre of the mist chamber floor", fit: "About 15 mm of distilled water; 45 mm air gap all round.", cost: "~₦3,500" }, 0.2),
        box("mesh", "Droplet catcher mesh", ["W - 6", 6, "W - 6"], [0, 142, 0], [0, -5, 0], "#d7e8f5", "Filters", { where: "Top of the mist chamber", fit: "Non-metal scouring pad; stops droplets reaching the filters.", cost: "~₦500" }, 0.2),
        box("foam", "Foam pre-filter", ["W - 6", 10, "W - 6"], [0, 151, 0], [0, 25, 0], GOOD, "Filters", { where: "Above the mesh", fit: "Seal the edges with foam tape.", cost: "in media ~₦4,000" }, 0.2),
        box("carbon", "Carbon sheet", ["W - 6", 5, "W - 6"], [0, 158.5, 0], [0, 50, 0], "#6f8f86", "Filters", { where: "Between foam and HEPA", fit: "Cut square, seal edges.", cost: "in media" }, 0.35),
        box("hepa", "HEPA-type media", ["W - 6", 50, "W - 6"], [0, 186, 0], [0, 85, 0], GOOD, "Filters", { where: "Above the carbon", fit: "Frame it and tape all round so air can't skip it.", cost: "~₦4,000" }, 0.15),
        box("plenum", "Plenum", ["W", 40, "W"], [0, 231, 0], [0, 130, 0], CY, "Housing", { where: "Above the filter stack", fit: "Lets air spread out before the fan.", cost: "in enclosure set" }, 0.06),
        { id: "fan", name: "12 V fan", shape: "cylinder" as const, size: [56, 25], pos: [0, 263.5, 0], explode: [0, 180, 0] as [number, number, number], color: WARM, group: "Fan", opacity: 0.25, info: { where: "Top of the plenum, blowing up", fit: "Airflow arrow pointing up and out.", cost: "~₦4,000" } },
        box("grille", "Top grille plate", ["W", 3, "W"], [0, 277.5, 0], [0, 225, 0], CY, "Housing", { where: "Closes the top", fit: "112 mm hole over the fan with a finger guard.", cost: "in enclosure set" }, 0.16),
        box("bay", "Electronics bay", [70, 130, 150], ["W / 2 + 35", 85, 0], [95, 0, 0], ELEC, "Electronics", { where: "Outside the right wall, low", fit: "Keeps electronics out of the dust and damp.", cost: "in enclosure set" }, 0.06),
        box("esp32", "ESP32 DevKit", [28, 5, 51], ["W / 2 + 35", 36, -48], [95, 48, 0], ELEC, "Electronics", { where: "Bay floor on standoffs", fit: "Reads sensors, sets fan speed, switches the mist.", cost: "~₦10,000" }, 0.3),
      ],
      steps: [
        { id: "c1", title: "Explore the stack", detail: "Drag the Explode slider and tap each part to see where it goes.", videoQuery: "how HEPA air purifier works", check: { kind: "manual" } },
        { id: "c2", title: "Resize it", detail: "Change the unit width — every panel and filter resizes with it.", check: { kind: "manual" } },
      ],
    },
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** The spec a new design starts from: the guided starter if there is one, otherwise the full build. */
export function templateStart(t: Template, guided = true): DesignSpec {
  return parseSpec(guided && t.starter ? t.starter : t.spec);
}

export function templateSolution(t: Template): DesignSpec {
  return parseSpec(t.spec);
}
