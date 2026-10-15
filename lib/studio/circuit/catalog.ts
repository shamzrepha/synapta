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
  category: "board" | "output" | "input" | "passive" | "driver" | "power";
  /** true when its behaviour and dimensions come from a datasheet (see parts/library.ts) */
  verified?: boolean;
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
    type: "ir_sensor",
    name: "Line sensor (TCRT5000 module)",
    verified: true,
    category: "input",
    description: "Shines infrared light at the floor and reads how much comes back: a dark line reflects little (reads HIGH here), a light floor reflects a lot (LOW). VCC to 5V, GND to GND, OUT to a pin — digitalRead(pin) or analogRead. Mount it facing the floor at the front of a robot.",
    w: 60,
    h: 50,
    pins: [
      { name: "vcc", role: "power", x: 0.2, y: 1 },
      { name: "gnd", role: "ground", x: 0.5, y: 1 },
      { name: "out", role: "signalOut", x: 0.8, y: 1 },
    ],
    props: { value: 80 },
    cost: "₦700",
    learn: "TCRT5000 line follower sensor arduino",
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
    name: "Servo motor (SG90)",
    verified: true,
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
    type: "l298n",
    name: "L298N motor driver (dual H-bridge)",
    category: "driver",
    verified: true,
    description: "Drives two DC motors. Per bridge: ENA/ENB high (or PWM) enables it; IN1/IN2 pick the direction (H,L forward · L,H reverse · equal = brake). VS = battery (motor power), +5V = logic power, GND must be shared with the board. The bridge burns 2–3 V, so the motor gets less than the battery gives. ENA/ENB are tied high by the module's jumpers unless you wire them.",
    w: 130,
    h: 96,
    pins: [
      { name: "out1", role: "loadOut", x: 0.08, y: 0 },
      { name: "out2", role: "loadOut", x: 0.2, y: 0 },
      { name: "out3", role: "loadOut", x: 0.8, y: 0 },
      { name: "out4", role: "loadOut", x: 0.92, y: 0 },
      { name: "vs", role: "power", x: 0.06, y: 1 },
      { name: "gnd", role: "ground", x: 0.16, y: 1 },
      { name: "v5", role: "power", x: 0.26, y: 1 },
      { name: "ena", role: "signalIn", x: 0.36, y: 1 },
      { name: "in1", role: "signalIn", x: 0.46, y: 1 },
      { name: "in2", role: "signalIn", x: 0.56, y: 1 },
      { name: "in3", role: "signalIn", x: 0.66, y: 1 },
      { name: "in4", role: "signalIn", x: 0.76, y: 1 },
      { name: "enb", role: "signalIn", x: 0.88, y: 1 },
    ],
    props: { jumperEnA: 1, jumperEnB: 1, jumper5v: 0 },
    cost: "₦3,000",
    learn: "L298N motor driver arduino how it works",
  },
  {
    type: "tb6612",
    name: "TB6612FNG motor driver (dual MOSFET)",
    category: "driver",
    verified: true,
    description: "Drives two DC motors with MOSFETs (almost no voltage lost). Per channel: IN1/IN2 pick the direction, PWM sets the speed (H,L + PWM high = CW; L,H + PWM high = CCW; both HIGH or PWM low = short brake; both LOW = stop). STBY must be pulled HIGH or nothing moves. VM = battery, VCC = logic 5 V.",
    w: 130,
    h: 90,
    pins: [
      { name: "aout1", role: "loadOut", x: 0.08, y: 0 },
      { name: "aout2", role: "loadOut", x: 0.22, y: 0 },
      { name: "bout1", role: "loadOut", x: 0.78, y: 0 },
      { name: "bout2", role: "loadOut", x: 0.92, y: 0 },
      { name: "vm", role: "power", x: 0.05, y: 1 },
      { name: "vcc", role: "power", x: 0.15, y: 1 },
      { name: "gnd", role: "ground", x: 0.25, y: 1 },
      { name: "stby", role: "signalIn", x: 0.35, y: 1 },
      { name: "pwma", role: "signalIn", x: 0.45, y: 1 },
      { name: "ain1", role: "signalIn", x: 0.55, y: 1 },
      { name: "ain2", role: "signalIn", x: 0.65, y: 1 },
      { name: "bin1", role: "signalIn", x: 0.75, y: 1 },
      { name: "bin2", role: "signalIn", x: 0.85, y: 1 },
      { name: "pwmb", role: "signalIn", x: 0.95, y: 1 },
    ],
    cost: "₦4,500",
    learn: "TB6612FNG motor driver arduino",
  },
  {
    type: "hc_sr04",
    name: "HC-SR04 ultrasonic distance sensor",
    category: "input",
    verified: true,
    description: "Measures distance with ultrasound. VCC 5 V, GND. Give TRIG a ≥10 µs HIGH pulse, then pulseIn(ECHO, HIGH) returns the echo time in µs; centimetres = µs ÷ 58. Range 2 cm – 4 m, 15° cone. Wait 60 ms between measurements.",
    w: 90,
    h: 50,
    pins: [
      { name: "vcc", role: "power", x: 0.15, y: 1 },
      { name: "trig", role: "signalIn", x: 0.38, y: 1 },
      { name: "echo", role: "signalOut", x: 0.62, y: 1 },
      { name: "gnd", role: "ground", x: 0.85, y: 1 },
    ],
    props: { value: 100 },
    cost: "₦1,500",
    learn: "HC-SR04 arduino pulseIn distance",
  },
  {
    type: "stepper",
    name: "28BYJ-48 stepper + ULN2003 driver",
    category: "output",
    verified: true,
    description: "A geared 5 V stepper on its ULN2003 driver board. IN1–IN4 each energise one coil while HIGH; step through the half-step sequence (1000, 1100, 0100, 0110, 0010, 0011, 0001, 1001) and the shaft turns 360° ÷ 4096 per step. Power: 5 V and GND (shared with the board). Helper: stepperRun(in1, in2, in3, in4, steps, msPerStep).",
    w: 120,
    h: 90,
    pins: [
      { name: "in1", role: "signalIn", x: 0.12, y: 1 },
      { name: "in2", role: "signalIn", x: 0.3, y: 1 },
      { name: "in3", role: "signalIn", x: 0.48, y: 1 },
      { name: "in4", role: "signalIn", x: 0.66, y: 1 },
      { name: "gnd", role: "ground", x: 0.8, y: 1 },
      { name: "vcc", role: "power", x: 0.93, y: 1 },
    ],
    currentMa: 240,
    cost: "₦3,500",
    learn: "28BYJ-48 stepper ULN2003 arduino",
  },
  {
    type: "oled",
    name: "SSD1306 OLED display (128×64, I2C)",
    category: "output",
    verified: true,
    description: "A 128×64 pixel OLED on I2C. VCC to 3V3 or 5V, GND, SDA to A4 and SCL to A5. Code: oledPrint(text) adds a line (8 lines of 21 characters), oledText(row, text) writes one line, oledClear() wipes it.",
    w: 100,
    h: 70,
    pins: [
      { name: "gnd", role: "ground", x: 0.15, y: 1 },
      { name: "vcc", role: "power", x: 0.38, y: 1 },
      { name: "scl", role: "signalIn", x: 0.62, y: 1 },
      { name: "sda", role: "signalIn", x: 0.85, y: 1 },
    ],
    currentMa: 20,
    cost: "₦3,500",
    learn: "SSD1306 OLED arduino I2C wiring",
  },
  {
    type: "dht11",
    name: "DHT11 temperature & humidity sensor",
    category: "input",
    verified: true,
    description: "Digital sensor: 0–50 °C and 20–90 %RH, whole numbers, at most one reading per second. VCC 3–5.5 V, GND, DATA to a digital pin. Code: dhtTemperature(pin) in °C and dhtHumidity(pin) in %RH. In Run, use the two sliders to change the air.",
    w: 60,
    h: 60,
    pins: [
      { name: "vcc", role: "power", x: 0.2, y: 1 },
      { name: "data", role: "signalOut", x: 0.5, y: 1 },
      { name: "gnd", role: "ground", x: 0.8, y: 1 },
    ],
    props: { value: 24, humidity: 55 },
    currentMa: 2,
    cost: "₦1,800",
    learn: "DHT11 arduino temperature humidity",
  },
  {
    type: "relay",
    name: "5 V relay module",
    category: "output",
    verified: true,
    description: "A coil-operated switch. VCC 5 V and GND power the coil; IN energises it (many modules trigger on LOW — set 'Active level' to match yours). While energised COM connects to NO, otherwise COM connects to NC. COM/NO/NC are isolated from the board, so they can switch a battery, LED or motor.",
    w: 110,
    h: 80,
    pins: [
      { name: "vcc", role: "power", x: 0.1, y: 1 },
      { name: "gnd", role: "ground", x: 0.25, y: 1 },
      { name: "in", role: "signalIn", x: 0.4, y: 1 },
      { name: "nc", role: "passive", x: 0.6, y: 0 },
      { name: "com", role: "passive", x: 0.78, y: 0 },
      { name: "no", role: "passive", x: 0.95, y: 0 },
    ],
    props: { activeLow: 1 },
    currentMa: 90,
    cost: "₦1,500",
    learn: "5V relay module arduino wiring COM NO NC",
  },
  {
    type: "mpu6050",
    name: "MPU-6050 accelerometer/gyro (I2C)",
    category: "input",
    verified: true,
    description: "Measures tilt and motion in g. VCC, GND, SDA to A4 and SCL to A5. Code: accelX(), accelY(), accelZ() return g (about 1 g in total when still; flat = Z of +1 g). In Run, tilt it with the two sliders.",
    w: 70,
    h: 60,
    pins: [
      { name: "vcc", role: "power", x: 0.12, y: 1 },
      { name: "gnd", role: "ground", x: 0.37, y: 1 },
      { name: "scl", role: "signalIn", x: 0.63, y: 1 },
      { name: "sda", role: "signalIn", x: 0.88, y: 1 },
    ],
    props: { value: 0, tiltY: 0 },
    currentMa: 4,
    cost: "₦2,000",
    learn: "MPU6050 arduino accelerometer tilt",
  },
  {
    type: "battery",
    name: "Battery pack",
    category: "power",
    description: "The motor power supply. Choose the voltage (4×AA alkaline = 6 V, 9 V, 2S LiPo = 7.4 V). Connect − to the board GND (a shared ground) and + to the driver's motor-supply pin.",
    w: 70,
    h: 50,
    pins: [
      { name: "plus", role: "power", volts: 6, x: 0.25, y: 1 },
      { name: "minus", role: "ground", x: 0.75, y: 1 },
    ],
    props: { volts: 6 },
    cost: "₦1,800",
    learn: "battery pack for arduino robot",
  },
  {
    type: "dc_motor",
    name: "DC gearbox motor (TT, 3–6 V)",
    category: "output",
    verified: true,
    description: "The yellow TT gearbox motor: 3–6 V, 250 rpm at 6 V (120 rpm at 3 V), about 150 mA running and 1.5 A stalled — far more than a pin can give, so it needs a motor driver. Speed follows the voltage it actually receives.",
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
