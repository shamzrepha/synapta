/**
 * Virtual components for the circuit bench. Pins carry roles so wiring can be checked the way
 * SunRoot's GraphChecker does it: power in, ground, signal in/out, load terminals.
 */

export type PinRole = "power" | "ground" | "digital" | "analog" | "signalIn" | "signalOut" | "passive" | "anode" | "cathode" | "loadOut";

export interface PinDef {
  name: string;
  role: PinRole;
  /** board pins: Arduino number used in code (D13 → 13, A0 → 14) */
  number?: number;
  pwm?: boolean;
  /** power pins: volts supplied */
  volts?: number;
  /** position on the part's drawing, 0..1 of its box */
  x: number;
  y: number;
}

export interface ComponentDef {
  type: string;
  name: string;
  category: "board" | "output" | "input" | "passive" | "driver";
  description: string;
  w: number;
  h: number;
  pins: PinDef[];
  /** default props (LED colour, resistor ohms, sensor value…) */
  props?: Record<string, string | number>;
  /** typical current draw (mA) when on, for pin-overload checks */
  currentMa?: number;
  /** approximate local price, for parts lists */
  cost?: string;
  /** what to search for on YouTube to learn this part */
  learn?: string;
}

const boardPins: PinDef[] = [
  ...Array.from({ length: 12 }, (_, i) => {
    const n = 13 - i;
    return { name: `D${n}`, role: "digital" as const, number: n, pwm: [3, 5, 6, 9, 10, 11].includes(n), x: (i + 1) / 13, y: 0 };
  }),
  ...Array.from({ length: 6 }, (_, i) => ({ name: `A${i}`, role: "analog" as const, number: 14 + i, x: (i + 7) / 14, y: 1 })),
  { name: "5V", role: "power", volts: 5, x: 2 / 14, y: 1 },
  { name: "3V3", role: "power", volts: 3.3, x: 1 / 14, y: 1 },
  { name: "GND", role: "ground", x: 3 / 14, y: 1 },
  { name: "GND2", role: "ground", x: 4 / 14, y: 1 },
  { name: "GND3", role: "ground", x: 0.995, y: 0 },
];

export const CATALOG: ComponentDef[] = [
  {
    type: "board",
    name: "Starter board (Arduino-style)",
    category: "board",
    description: "The brain. Digital pins D2–D13 switch things on/off (~ marks PWM), A0–A5 read analog sensors. Each pin can supply about 20 mA.",
    w: 300,
    h: 120,
    pins: boardPins,
    cost: "₦12,000",
    learn: "Arduino Uno pins explained",
  },
  {
    type: "led",
    name: "LED",
    category: "output",
    description: "Lights when current flows from the long leg (anode, +) to the short leg (cathode, −). Always add a resistor (220–1kΩ) or it burns out.",
    w: 40,
    h: 70,
    pins: [
      { name: "anode", role: "anode", x: 0.3, y: 1 },
      { name: "cathode", role: "cathode", x: 0.7, y: 1 },
    ],
    props: { color: "red" },
    currentMa: 15,
    cost: "₦50",
    learn: "how to use an LED with a resistor arduino",
  },
  {
    type: "resistor",
    name: "Resistor",
    category: "passive",
    description: "Limits current. For an LED on 5 V, 220 Ω gives about 14 mA. Colour bands show the value.",
    w: 80,
    h: 24,
    pins: [
      { name: "a", role: "passive", x: 0, y: 0.5 },
      { name: "b", role: "passive", x: 1, y: 0.5 },
    ],
    props: { ohms: 220 },
    cost: "₦20",
    learn: "resistor color code and ohm's law",
  },
  {
    type: "button",
    name: "Push button",
    category: "input",
    description: "Connects its two legs while pressed. Wire one leg to a pin and the other to GND, then use pinMode(pin, INPUT_PULLUP): the pin reads LOW when pressed.",
    w: 50,
    h: 50,
    pins: [
      { name: "a", role: "passive", x: 0, y: 1 },
      { name: "b", role: "passive", x: 1, y: 1 },
    ],
    cost: "₦100",
    learn: "arduino push button input pullup",
  },
  {
    type: "switch",
    name: "Toggle switch",
    category: "input",
    description: "A latching switch: tap it once to turn on, again to turn off. Wire one leg to a pin and the other to GND, then use pinMode(pin, INPUT_PULLUP): the pin reads LOW while the switch is ON.",
    w: 60,
    h: 50,
    pins: [
      { name: "a", role: "passive", x: 0, y: 1 },
      { name: "b", role: "passive", x: 1, y: 1 },
    ],
    cost: "₦150",
    learn: "arduino toggle switch input pullup",
  },
  {
    type: "buzzer",
    name: "Buzzer",
    category: "output",
    description: "Beeps when powered (active) or plays tone(pin, frequency). + leg to a pin, − leg to GND.",
    w: 50,
    h: 50,
    pins: [
      { name: "pos", role: "anode", x: 0.3, y: 1 },
      { name: "neg", role: "cathode", x: 0.7, y: 1 },
    ],
    currentMa: 15,
    cost: "₦300",
    learn: "arduino buzzer tone",
  },
  {
    type: "potentiometer",
    name: "Potentiometer (knob)",
    category: "input",
    description: "A knob that gives 0–5 V on its middle pin. Outer pins to 5V and GND, middle (wiper) to an analog pin; analogRead gives 0–1023.",
    w: 60,
    h: 60,
    pins: [
      { name: "vcc", role: "power", x: 0.15, y: 1 },
      { name: "wiper", role: "signalOut", x: 0.5, y: 1 },
      { name: "gnd", role: "ground", x: 0.85, y: 1 },
    ],
    props: { value: 512 },
    cost: "₦200",
    learn: "arduino potentiometer analogRead",
  },
  {
    type: "light_sensor",
    name: "Light sensor (LDR module)",
    category: "input",
    description: "Gives a higher analog reading in brighter light. VCC to 5V, GND to GND, OUT to an analog pin.",
    w: 60,
    h: 50,
    pins: [
      { name: "vcc", role: "power", x: 0.2, y: 1 },
      { name: "gnd", role: "ground", x: 0.5, y: 1 },
      { name: "out", role: "signalOut", x: 0.8, y: 1 },
    ],
    props: { value: 600 },
    cost: "₦500",
    learn: "arduino LDR light sensor",
  },
  {
    type: "temp_sensor",
    name: "Temperature sensor (analog)",
    category: "input",
    description: "Analog output that rises with temperature (about 10 mV per °C, like an LM35). VCC, GND, OUT to an analog pin.",
    w: 50,
    h: 50,
    pins: [
      { name: "vcc", role: "power", x: 0.2, y: 1 },
      { name: "out", role: "signalOut", x: 0.5, y: 1 },
      { name: "gnd", role: "ground", x: 0.8, y: 1 },
    ],
    props: { value: 61 },
    cost: "₦1,500",
    learn: "LM35 temperature sensor arduino",
  },
  {
    type: "servo",
    name: "Servo motor",
    category: "output",
    description: "Turns to an angle 0–180°. Brown/black to GND, red to 5V, orange signal to a digital pin; use servoWrite(pin, angle).",
    w: 70,
    h: 50,
    pins: [
      { name: "gnd", role: "ground", x: 0.2, y: 1 },
      { name: "vcc", role: "power", x: 0.5, y: 1 },
      { name: "signal", role: "signalIn", x: 0.8, y: 1 },
    ],
    currentMa: 150,
    cost: "₦2,500",
    learn: "arduino servo motor sg90",
  },
  {
    type: "motor_driver",
    name: "Motor driver (1 channel)",
    category: "driver",
    description: "Lets a small pin signal switch a big motor current. VCC/GND for power, IN from a pin (analogWrite for speed), OUT+/OUT− to the motor.",
    w: 80,
    h: 60,
    pins: [
      { name: "vcc", role: "power", x: 0.1, y: 1 },
      { name: "gnd", role: "ground", x: 0.3, y: 1 },
      { name: "in", role: "signalIn", x: 0.5, y: 1 },
      { name: "out1", role: "loadOut", x: 0.75, y: 0 },
      { name: "out2", role: "loadOut", x: 0.95, y: 0 },
    ],
    cost: "₦2,000",
    learn: "L298N motor driver arduino",
  },
  {
    type: "dc_motor",
    name: "DC motor",
    category: "output",
    description: "Spins when powered. Draws ~200 mA — far more than a pin can give — so drive it through a motor driver.",
    w: 60,
    h: 60,
    pins: [
      { name: "a", role: "passive", x: 0.3, y: 1 },
      { name: "b", role: "passive", x: 0.7, y: 1 },
    ],
    currentMa: 200,
    cost: "₦1,500",
    learn: "how a dc motor works",
  },
];

/** Parts that close a circuit between their legs when pressed / switched on. */
export const isButtonLike = (type: string): boolean => type === "button" || type === "switch";

export const CATALOG_BY_TYPE: Record<string, ComponentDef> = Object.fromEntries(CATALOG.map((c) => [c.type, c]));

export const LED_COLORS: Record<string, string> = {
  red: "#ef4444",
  yellow: "#facc15",
  amber: "#f59e0b",
  green: "#22c55e",
  blue: "#3b82f6",
  white: "#f8fafc",
};

export function pinDef(type: string, pin: string): PinDef | undefined {
  return CATALOG_BY_TYPE[type]?.pins.find((p) => p.name === pin);
}

/** Board pin name for a number used in code: 13 → "D13", 14 → "A0" */
export function boardPinName(n: number): string | null {
  if (n >= 0 && n <= 13) return `D${n}`;
  if (n >= 14 && n <= 19) return `A${n - 14}`;
  return null;
}
