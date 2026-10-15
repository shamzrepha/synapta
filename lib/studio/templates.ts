import { compileBlocks, type BlockProgram } from "./blocks";
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


const switchBlocks: BlockProgram = {
  setup: [],
  loop: [
    { id: "a1", type: "if", cond: { kind: "pressed", pin: 2 }, then: [{ id: "a2", type: "pwm", pin: 5, value: 200 }], else: [{ id: "a3", type: "pwm", pin: 5, value: 0 }] },
    { id: "a4", type: "wait", ms: 20 },
  ],
};


// ---------- line-following robot ----------
const lineRobot = {
  wheelRadius: 21,
  trackWidth: 112,
  length: 150,
  wheelWidth: 14,
  maxRpm: 160,
  left: "mL",
  right: "mR",
  sensors: [{ id: "sL", x: -17, z: -78 }, { id: "sR", x: 17, z: -78 }],
  body: "auto" as const,
};
function lineCircuit() {
  return {
    parts: [
      board,
      { id: "sL", type: "ir_sensor", label: "Left sensor", x: 80, y: 90 },
      { id: "sR", type: "ir_sensor", label: "Right sensor", x: 180, y: 90 },
      { id: "drvL", type: "motor_driver", label: "Left driver", x: 330, y: 200 },
      { id: "drvR", type: "motor_driver", label: "Right driver", x: 470, y: 200 },
      { id: "mL", type: "dc_motor", label: "Left motor", x: 330, y: 70 },
      { id: "mR", type: "dc_motor", label: "Right motor", x: 470, y: 70 },
    ],
    wires: [
      w("w1", "sL.vcc", "board.5V", "#ef4444"),
      w("w2", "sL.gnd", "board.GND", "#111827"),
      w("w3", "sL.out", "board.D2", "#f59e0b"),
      w("w4", "sR.vcc", "board.5V", "#ef4444"),
      w("w5", "sR.gnd", "board.GND", "#111827"),
      w("w6", "sR.out", "board.D3", "#f59e0b"),
      w("w7", "drvL.vcc", "board.5V", "#ef4444"),
      w("w8", "drvL.gnd", "board.GND", "#111827"),
      w("w9", "board.D5", "drvL.in", "#3b82f6"),
      w("w10", "drvL.out1", "mL.a"),
      w("w11", "drvL.out2", "mL.b"),
      w("w12", "drvR.vcc", "board.5V", "#ef4444"),
      w("w13", "drvR.gnd", "board.GND", "#111827"),
      w("w14", "board.D6", "drvR.in", "#22c55e"),
      w("w15", "drvR.out1", "mR.a"),
      w("w16", "drvR.out2", "mR.b"),
    ],
  };
}
const lineCode = `var LEFT_SENSOR = 2;
var RIGHT_SENSOR = 3;
var LEFT_MOTOR = 5;   // PWM pin to the left driver
var RIGHT_MOTOR = 6;  // PWM pin to the right driver
var FAST = 190;
var SLOW = 30;

function setup() {
  pinMode(LEFT_SENSOR, INPUT);
  pinMode(RIGHT_SENSOR, INPUT);
  pinMode(LEFT_MOTOR, OUTPUT);
  pinMode(RIGHT_MOTOR, OUTPUT);
}

function loop() {
  var left = digitalRead(LEFT_SENSOR);   // HIGH = over the dark line
  var right = digitalRead(RIGHT_SENSOR);
  if (left == HIGH) {
    // line is under the left sensor: steer left by slowing the left wheel
    analogWrite(LEFT_MOTOR, SLOW);
    analogWrite(RIGHT_MOTOR, FAST);
  } else if (right == HIGH) {
    analogWrite(LEFT_MOTOR, FAST);
    analogWrite(RIGHT_MOTOR, SLOW);
  } else {
    analogWrite(LEFT_MOTOR, FAST);
    analogWrite(RIGHT_MOTOR, FAST);
  }
}
`;
function lineSteps() {
  return [
    { id: "l1", title: "Meet the robot", detail: "Open the 3D view and orbit it. Two wheels share one axle, a caster ball holds the back, and two line sensors face the floor at the front. Open the Track view to see the oval it must follow.", videoQuery: "how a line following robot works", check: { kind: "manual" as const } },
    { id: "l2", title: "Wire the sensors", detail: "Each sensor needs 5V, GND and its OUT wire to a pin (D2 left, D3 right). An unpowered sensor reads nothing, so the robot would drive blind.", videoQuery: "ir line sensor arduino wiring", check: { kind: "parts" as const, type: "ir_sensor", min: 2 } },
    { id: "l3", title: "Wire the motors through drivers", detail: "One driver per motor: VCC→5V, GND→GND, IN→D5 (left) / D6 (right), OUT1→motor a, OUT2→motor b. Same wiring on both sides, so positive power means forward on both.", videoQuery: "arduino l298n dc motor wiring", check: { kind: "wired" as const, part: "mL" } },
    { id: "l4", title: "Write the steering code", detail: "Read both sensors. Left sensor sees the line → slow the left wheel. Right sensor sees it → slow the right wheel. Otherwise drive straight. Press Run and watch the Track view.", videoQuery: "arduino line follower code explained", check: { kind: "drive" as const, seconds: 20, laps: 1, onLine: 0.8 } },
    { id: "l5", title: "Tune it", detail: "Try FAST = 255 and SLOW = 0. Faster robots overshoot corners. Find the fastest settings that still finish a lap without leaving the line.", check: { kind: "manual" as const } },
  ];
}
function lineTests() {
  return [];
}

// ---------- RC car helpers ----------
const carWheel = (id: string, side: "L" | "R", x: number, z: number) => [
  { id: `${id}_tyre`, name: `${side === "L" ? "Left" : "Right"} wheel ${z > 0 ? "front" : "rear"}`, shape: "torus" as const, size: [17, 5], pos: [x, 22, z] as [N, N, N], rot: [0, 0, 90] as [N, N, N], color: "#475569", opacity: 0.55, group: "Wheels", spinWith: `m${side}`, spinAxis: "x" as const, explode: [x > 0 ? 40 : -40, 0, 0] as [number, number, number], info: { where: `${side === "L" ? "Left" : "Right"} side, ${z > 0 ? "front" : "rear"}`, fit: "Press onto the motor shaft or axle.", cost: "~₦1,500" } },
  { id: `${id}_spoke`, name: `${side === "L" ? "Left" : "Right"} wheel spoke ${z > 0 ? "front" : "rear"}`, shape: "box" as const, size: [4, 4, 30], pos: [x, 22, z] as [N, N, N], color: "#e2e8f0", opacity: 0.5, group: "Wheels", spinWith: `m${side}`, spinAxis: "x" as const, explode: [x > 0 ? 40 : -40, 0, 0] as [number, number, number] },
];
function carParts() {
  return [
    { id: "chassis", name: "Chassis plate", shape: "box" as const, size: [90, 6, 170], pos: [0, 24, 0] as [N, N, N], color: "#8fd3ff", opacity: 0.22, group: "Body", explode: [0, -10, 0] as [number, number, number], info: { where: "The base everything mounts on", fit: "3 mm plywood or acrylic, 90 × 170 mm.", cost: "~₦1,500" } },
    { id: "nose", name: "Front marker", shape: "cone" as const, size: [8, 18], pos: [0, 24, 96] as [N, N, N], rot: [90, 0, 0] as [N, N, N], color: "#fbbf24", opacity: 0.4, group: "Body" },
    { id: "battery", name: "Battery pack", shape: "box" as const, size: [32, 20, 40], pos: [0, 37, -62] as [N, N, N], color: "#f87171", opacity: 0.3, group: "Power", explode: [0, 40, 0] as [number, number, number], info: { where: "Centre-rear on the chassis", fit: "4 × AA holder, strapped down. Heavy parts low and central.", cost: "~₦1,800" } },
    { id: "goCap", name: "Go button", shape: "cylinder" as const, size: [7, 5], pos: [-22, 29.5, -35] as [N, N, N], color: "#22c55e", opacity: 0.6, group: "Controls", bind: "go", pressShift: [0, -2, 0] as [number, number, number], info: { where: "Top of the chassis, rear left", fit: "Click it in 3D: it works like the Go button on the circuit bench.", cost: "~₦100" } },
    { id: "turnCap", name: "Turn button", shape: "cylinder" as const, size: [7, 5], pos: [22, 29.5, -35] as [N, N, N], color: "#f59e0b", opacity: 0.6, group: "Controls", bind: "turn", pressShift: [0, -2, 0] as [number, number, number], info: { where: "Top of the chassis, rear right", fit: "Hold it while Go is held and the car curves.", cost: "~₦100" } },
    { id: "uno", name: "Control board", bind: "board", shape: "box" as const, size: [54, 6, 72], pos: [0, 30, 40] as [N, N, N], color: "#5eead4", opacity: 0.3, group: "Electronics", explode: [0, 60, 0] as [number, number, number], info: { where: "Front half of the chassis", fit: "Standoffs under each corner.", cost: "~₦12,000" } },
    { id: "drvL", name: "Left motor driver", bind: "drvL", shape: "box" as const, size: [26, 10, 22], pos: [-26, 32, -78] as [N, N, N], color: "#a78bfa", opacity: 0.3, group: "Electronics", explode: [-20, 60, 0] as [number, number, number] },
    { id: "drvR", name: "Right motor driver", bind: "drvR", shape: "box" as const, size: [26, 10, 22], pos: [26, 32, -78] as [N, N, N], color: "#a78bfa", opacity: 0.3, group: "Electronics", explode: [20, 60, 0] as [number, number, number] },
    { id: "motL", name: "Left motor", shape: "cylinder" as const, size: [9, 34], pos: [-37, 22, 50] as [N, N, N], rot: [0, 0, 90] as [N, N, N], color: "#fcd34d", opacity: 0.4, group: "Motors", explode: [-20, 0, 0] as [number, number, number] },
    { id: "motR", name: "Right motor", shape: "cylinder" as const, size: [9, 34], pos: [37, 22, 50] as [N, N, N], rot: [0, 0, 90] as [N, N, N], color: "#fcd34d", opacity: 0.4, group: "Motors", explode: [20, 0, 0] as [number, number, number] },
    ...carWheel("wLf", "L", -58, 50),
    ...carWheel("wLr", "L", -58, -50),
    ...carWheel("wRf", "R", 58, 50),
    ...carWheel("wRr", "R", 58, -50),
  ];
}
function carCircuit() {
  return {
    parts: [
      board,
      { id: "drvL", type: "motor_driver", label: "Left driver", x: 300, y: 200 },
      { id: "drvR", type: "motor_driver", label: "Right driver", x: 440, y: 200 },
      { id: "mL", type: "dc_motor", label: "Left motor", x: 300, y: 70 },
      { id: "mR", type: "dc_motor", label: "Right motor", x: 440, y: 70 },
      { id: "go", type: "button", label: "Go", x: 120, y: 120 },
      { id: "turn", type: "button", label: "Turn", x: 200, y: 120 },
    ],
    wires: [
      w("w1", "board.5V", "drvL.vcc", "#ef4444"),
      w("w2", "drvL.gnd", "board.GND", "#111827"),
      w("w3", "board.D5", "drvL.in", "#3b82f6"),
      w("w4", "drvL.out1", "mL.a"),
      w("w5", "drvL.out2", "mL.b"),
      w("w6", "board.5V", "drvR.vcc", "#ef4444"),
      w("w7", "drvR.gnd", "board.GND", "#111827"),
      w("w8", "board.D6", "drvR.in", "#22c55e"),
      w("w9", "drvR.out1", "mR.a"),
      w("w10", "drvR.out2", "mR.b"),
      w("w11", "go.a", "board.D2"),
      w("w12", "go.b", "board.GND"),
      w("w13", "turn.a", "board.D4"),
      w("w14", "turn.b", "board.GND"),
    ],
  };
}
const carCode = `var LEFT = 5;   // PWM pin to the left driver
var RIGHT = 6;  // PWM pin to the right driver
var GO = 2;
var TURN = 4;

function setup() {
  pinMode(LEFT, OUTPUT);
  pinMode(RIGHT, OUTPUT);
  pinMode(GO, INPUT_PULLUP);
  pinMode(TURN, INPUT_PULLUP);
}

function loop() {
  if (digitalRead(GO) == LOW) {
    analogWrite(LEFT, 220);
    // running one side slower makes the car curve
    if (digitalRead(TURN) == LOW) {
      analogWrite(RIGHT, 70);
    } else {
      analogWrite(RIGHT, 220);
    }
  } else {
    analogWrite(LEFT, 0);
    analogWrite(RIGHT, 0);
  }
}
`;
function carSteps() {
  return [
    { id: "r1", title: "Look at the car in 3D", detail: "Drag to orbit, then move the Explode slider (in the 3D view) to see how the chassis, battery, board, drivers and motors stack. Tap a part to see where it goes.", videoQuery: "how to build a two wheel drive rc car", check: { kind: "manual" as const } },
    { id: "r2", title: "Add a driver and motor for each side", detail: "A motor draws about 200 mA, far more than a pin can give, so each one needs a motor driver between it and the board. Place two drivers and two DC motors.", videoQuery: "why motors need a motor driver", check: { kind: "parts" as const, type: "dc_motor", min: 2 } },
    { id: "r3", title: "Wire power, signal and motor", detail: "Driver VCC → 5V, GND → GND, IN → a PWM pin (D5 left, D6 right), OUT1/OUT2 → the motor's two legs.", videoQuery: "arduino l298n dc motor wiring", check: { kind: "wired" as const, part: "mL" } },
    { id: "r4", title: "Add Go and Turn buttons", detail: "One leg of each button to a pin (D2, D4), the other to GND, then use INPUT_PULLUP.", check: { kind: "parts" as const, type: "button", min: 2 } },
    { id: "r5", title: "Code it, press Run and watch the wheels", detail: "analogWrite(pin, 0–255) sets motor speed. Hold Go and the wheels in the 3D view should spin; hold Turn too and the car should curve because one side runs slower.", videoQuery: "arduino analogWrite pwm motor speed", check: { kind: "test" as const, testId: "go" } },
    { id: "r6", title: "Stretch: add reverse", detail: "Swap which driver output goes to which motor leg (or add a third button) and make the car back up.", check: { kind: "manual" as const } },
  ];
}
function carTests() {
  return [
    { id: "go", title: "Both motors run while Go is held", durationMs: 1500, inputs: [{ atMs: 400, part: "go", value: 1 }, { atMs: 1000, part: "go", value: 0 }], expect: { kind: "at" as const, checks: [{ atMs: 200, part: "mL", on: false }, { atMs: 700, part: "mL", on: true }, { atMs: 700, part: "mR", on: true }, { atMs: 1300, part: "mR", on: false }] } },
  ];
}

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
  {
    id: "rc-car",
    title: "RC car: 3D body, circuit and code",
    kind: "circuit",
    level: "intermediate",
    tags: ["robotics", "3d", "circuit", "code", "motors"],
    blurb: "Build a two-motor car in three views: see the body in 3D, wire the motors through drivers, then code it and watch the wheels turn.",
    starter: {
      kind: "circuit",
      summary: "A two-motor car. The 3D view shows the body; wire the drivers and motors on the bench, then write the code that drives them.",
      parts: carParts(),
      circuit: { parts: [board], wires: [] },
      code: "function setup() {\n  \n}\n\nfunction loop() {\n  \n}\n",
      steps: carSteps(),
      tests: carTests(),
    },
    spec: {
      kind: "circuit",
      summary: "A two-motor car. Each side's motor gets its own driver so the board can steer by running one side slower than the other.",
      parts: carParts(),
      circuit: carCircuit(),
      code: carCode,
      steps: carSteps(),
      tests: carTests(),
    },
  },
  {
    id: "switch-gears",
    title: "Switch → motor → gears (3D + circuit + code)",
    kind: "circuit",
    level: "beginner",
    tags: ["motors", "gears", "switch", "blocks", "3d"],
    blurb: "Flip a switch (on the circuit or on the 3D model) and a motor turns two meshing gears. Built with blocks; change the teeth and the ratio changes.",
    spec: {
      kind: "circuit",
      summary: "A latching switch tells the board to power the motor; the motor turns the small gear, which drives the big gear the other way, slower. One Run animates the circuit, the code and the 3D gears together.",
      params: [
        { key: "T1", label: "Motor gear teeth", value: 12, min: 8, max: 24, step: 1 },
        { key: "T2", label: "Output gear teeth", value: 24, min: 12, max: 48, step: 1 },
      ],
      parts: [
        { id: "plate", name: "Base plate", shape: "box", size: ["1.5*T1 + 1.5*T2 + 70", 6, 100], pos: [0, 3, 0], color: "#8fd3ff", opacity: 0.2, group: "Body", info: { where: "Under everything", fit: "3 mm plywood or acrylic." } },
        { id: "motorBody", name: "Motor", shape: "cylinder", size: [10, 30], pos: ["-(1.5*T1 + 1.5*T2)/2", 21, 0], color: "#fcd34d", opacity: 0.4, group: "Motor", explode: [0, -30, 0], info: { where: "Under the small gear", fit: "Shaft pointing up through the plate into the gear.", cost: "~₦1,500" } },
        { id: "gear1", name: "Motor gear", shape: "gear", teeth: "T1", size: ["1.5*T1", 8], pos: ["-(1.5*T1 + 1.5*T2)/2", 40, 0], bind: "m1", spinAxis: "y", spinRatio: 1, color: "#fb923c", opacity: 0.4, group: "Gears", explode: [0, 40, 0], info: { where: "On the motor shaft", fit: "Press-fit; module 3 so it meshes with the big gear." } },
        { id: "gear2", name: "Output gear", shape: "gear", teeth: "T2", size: ["1.5*T2", 8], pos: ["(1.5*T1 + 1.5*T2)/2", 40, 0], bind: "m1", spinAxis: "y", spinRatio: "-T1/T2", color: "#5eead4", opacity: 0.4, group: "Gears", explode: [0, 40, 0], info: { where: "Centre distance = both pitch radii", fit: "Turns the opposite way and slower by T1 ÷ T2." } },
        { id: "pointer", name: "Output pointer", shape: "box", size: ["1.5*T2 + 6", 3, 4], pos: ["(1.5*T1 + 1.5*T2)/2", 46, 0], bind: "m1", spinAxis: "y", spinRatio: "-T1/T2", color: "#f43f5e", opacity: 0.6, group: "Gears", explode: [0, 60, 0] },
        { id: "shaft2", name: "Output shaft", shape: "cylinder", size: [3, 22], pos: ["(1.5*T1 + 1.5*T2)/2", 28, 0], color: "#94a3b8", opacity: 0.6, group: "Gears" },
      ],
      circuit: {
        parts: [
          board,
          { id: "sw1", type: "switch", label: "Start switch", x: 120, y: 90 },
          { id: "drv", type: "motor_driver", label: "Motor driver", x: 360, y: 200 },
          { id: "m1", type: "dc_motor", label: "Motor", x: 360, y: 70 },
        ],
        wires: [
          w("w1", "sw1.a", "board.D2"),
          w("w2", "sw1.b", "board.GND"),
          w("w3", "board.5V", "drv.vcc", "#ef4444"),
          w("w4", "drv.gnd", "board.GND", "#111827"),
          w("w5", "board.D5", "drv.in", "#3b82f6"),
          w("w6", "drv.out1", "m1.a"),
          w("w7", "drv.out2", "m1.b"),
        ],
      },
      codeMode: "blocks",
      blocks: switchBlocks,
      code: compileBlocks(switchBlocks),
      steps: [
        { id: "x1", title: "Press Run, then flip the switch", detail: "Press Run. Flip the switch on the circuit bench — or tap the switch on the 3D model. The motor turns the small gear, which turns the big gear the other way.", videoQuery: "how gears change speed and direction", check: { kind: "test", testId: "start" } },
        { id: "x2", title: "Change the gear ratio", detail: "In Controls, change Output gear teeth. Ratio = output teeth ÷ motor teeth. A bigger output gear turns slower but with more torque.", check: { kind: "manual" } },
        { id: "x3", title: "Edit the blocks", detail: "Open Code → Blocks. Change the power from 200 to 100 and watch the gears slow down. Add a block to make the motor run only while the switch is OFF.", videoQuery: "scratch style block coding arduino", check: { kind: "code" } },
      ],
      tests: [{ id: "start", title: "Motor runs only while the switch is ON", durationMs: 1500, inputs: [{ atMs: 400, part: "sw1", value: 1 }, { atMs: 1000, part: "sw1", value: 0 }], expect: { kind: "at", checks: [{ atMs: 200, part: "m1", on: false }, { atMs: 700, part: "m1", on: true }, { atMs: 1300, part: "m1", on: false }] } }],
    },
  },
  {
    id: "line-follower",
    title: "Line-following robot (digital twin)",
    kind: "circuit",
    level: "intermediate",
    tags: ["robotics", "physics", "sensors", "code", "3d"],
    blurb: "Two line sensors, two driven wheels and a track. Wire it, code it, press Run and watch the real physics decide whether your robot follows the line — in 2D and in 3D.",
    starter: {
      kind: "circuit",
      summary: "A two-wheel robot on an oval track. Wire the sensors and the motor drivers, then write the code that steers it along the line.",
      robot: lineRobot,
      world: { track: { preset: "oval", width: 18 } },
      circuit: { parts: [board], wires: [] },
      code: "function setup() {\n  \n}\n\nfunction loop() {\n  \n}\n",
      steps: lineSteps(),
      tests: lineTests(),
    },
    spec: {
      kind: "circuit",
      summary: "The left and right sensors straddle the line. If the left one sees the dark line the robot is drifting right, so it slows the left wheel to turn left; the same on the other side. Both off the line: drive straight.",
      robot: lineRobot,
      world: { track: { preset: "oval", width: 18 } },
      circuit: lineCircuit(),
      code: lineCode,
      steps: lineSteps(),
      tests: lineTests(),
      notes: "Sensors read HIGH over the dark line. Wire OUT1→a and OUT2→b on both drivers so positive power drives both wheels forward.",
    },
  },
  {
    id: "phone-stand",
    title: "Adjustable phone stand (3D)",
    kind: "assembly",
    level: "beginner",
    tags: ["3d", "assembly", "design"],
    blurb: "A phone stand whose back rest tilts: change the angle and width and the whole model re-computes.",
    spec: {
      kind: "assembly",
      summary: "A weighted base, a tilted back rest and a front lip that stops the phone sliding. Rubber feet stop it skating.",
      params: [
        { key: "A", label: "Tilt angle", value: 70, min: 55, max: 85, step: 1, unit: "°" },
        { key: "W", label: "Stand width", value: 100, min: 80, max: 140, step: 5, unit: "mm" },
      ],
      parts: [
        { id: "base", name: "Base", shape: "box", size: ["W", 8, 90], pos: [0, 8, 0], color: "#5eead4", opacity: 0.25, group: "Body", explode: [0, -20, 0] },
        { id: "rest", name: "Back rest", shape: "box", size: ["W - 10", 120, 6], pos: [0, "12 + 60*sin(A)", "-10 - 60*cos(A)"], rot: ["-(90 - A)", 0, 0], color: "#8fd3ff", opacity: 0.25, group: "Body", explode: [0, 25, -20] },
        { id: "lip", name: "Front lip", shape: "box", size: ["W - 10", 14, 6], pos: [0, 21, 38], color: "#fcd34d", opacity: 0.3, group: "Body", explode: [0, 0, 25] },
        { id: "f1", name: "Rubber foot L", shape: "cylinder", size: [6, 4], pos: ["-W/2 + 10", 2, -30], color: "#475569", opacity: 0.5, group: "Feet", explode: [0, -45, 0] },
        { id: "f2", name: "Rubber foot R", shape: "cylinder", size: [6, 4], pos: ["W/2 - 10", 2, -30], color: "#475569", opacity: 0.5, group: "Feet", explode: [0, -45, 0] },
      ],
      steps: [
        { id: "p1", title: "Tilt it", detail: "Slide the Tilt angle setting. A steeper rest holds the phone upright; a shallower one is easier for typing.", check: { kind: "manual" } },
        { id: "p2", title: "Edit a part", detail: "Open the Build tab, tap a part and change its size or colour, or add a new shape of your own.", check: { kind: "manual" } },
      ],
    },
  },
  {
    id: "gear-set-3d",
    title: "Meshing gear pair (3D)",
    kind: "assembly",
    level: "intermediate",
    tags: ["3d", "gears", "mechanical"],
    blurb: "Two gears whose spacing is calculated from their tooth counts — change the teeth and they stay meshed.",
    spec: {
      kind: "assembly",
      summary: "Gears of module 3 mesh when their centres are the sum of their pitch radii (1.5 × teeth) apart.",
      params: [
        { key: "T1", label: "Driver teeth", value: 12, min: 8, max: 30, step: 1 },
        { key: "T2", label: "Driven teeth", value: 24, min: 8, max: 48, step: 1 },
      ],
      parts: [
        { id: "g1", name: "Driver gear", shape: "gear", teeth: "T1", size: ["1.5*T1", 10], pos: ["-(1.5*T1 + 1.5*T2)/2", 5, 0], color: "#fb923c", opacity: 0.35, group: "Gears", explode: [-20, 0, 0] },
        { id: "g2", name: "Driven gear", shape: "gear", teeth: "T2", size: ["1.5*T2", 10], pos: ["(1.5*T1 + 1.5*T2)/2", 5, 0], color: "#5eead4", opacity: 0.35, group: "Gears", explode: [20, 0, 0] },
        { id: "s1", name: "Driver shaft", shape: "cylinder", size: [3, 30], pos: ["-(1.5*T1 + 1.5*T2)/2", 10, 0], color: "#94a3b8", opacity: 0.6, group: "Shafts", explode: [-20, 20, 0] },
        { id: "s2", name: "Driven shaft", shape: "cylinder", size: [3, 30], pos: ["(1.5*T1 + 1.5*T2)/2", 10, 0], color: "#94a3b8", opacity: 0.6, group: "Shafts", explode: [20, 20, 0] },
      ],
      steps: [
        { id: "q1", title: "Change the teeth", detail: "Slide Driven teeth. Gear ratio = driven ÷ driver teeth. What ratio makes the driven gear turn at half speed?", videoQuery: "gear ratio explained", check: { kind: "manual" } },
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
