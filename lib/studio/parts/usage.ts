/**
 * How to use each shop part: wiring, a working code snippet, and the classic mistakes. These snippets
 * are sent to the AI together with the datasheet facts whenever a part is selected, so the model copies
 * proven wiring instead of inventing it. Every snippet runs in the Studio simulator (tests check that).
 * Pin names are the simulator's: D2–D13 / A0–A5 on the board.
 */
export interface PartUsage {
  wiring: string[];
  code?: string;
  mistakes: string[];
}

export const PART_USAGE: Record<string, PartUsage> = {
  board: {
    wiring: ["5V = the 5 V rail, GND / GND2 / GND3 = common ground (all one wire).", "D2–D13 are digital pins (D3, D5, D6, D9, D10, D11 can do PWM with analogWrite); A0–A5 read analog voltages."],
    mistakes: ["A pin gives only a few tens of mA: never power a motor, a servo or many LEDs from a pin."],
  },
  led: {
    wiring: ["board pin → resistor (220 Ω) → LED anode; LED cathode → GND."],
    code: "function setup(){ pinMode(13, OUTPUT); }\nfunction loop(){ digitalWrite(13, HIGH); delay(500); digitalWrite(13, LOW); delay(500); }",
    mistakes: ["No series resistor burns the LED (and the pin).", "Anode and cathode swapped: it stays dark."],
  },
  resistor: { wiring: ["Two legs, no polarity. In series with an LED use about 220 Ω ((5 V − 2 V) ÷ 220 Ω ≈ 14 mA)."], mistakes: [] },
  button: {
    wiring: ["One leg to a board pin, the other leg to GND."],
    code: "function setup(){ pinMode(2, INPUT_PULLUP); }\nfunction loop(){ if (digitalRead(2) == LOW) { /* pressed */ } }",
    mistakes: ["With INPUT_PULLUP the pin reads LOW while pressed (HIGH when released)."],
  },
  switch: {
    wiring: ["One leg to a board pin, the other to GND. Latching: tap to switch ON, tap again to switch OFF."],
    code: "function setup(){ pinMode(2, INPUT_PULLUP); }\nfunction loop(){ if (digitalRead(2) == LOW) { /* switch is ON */ } }",
    mistakes: ["Reads LOW when the switch is ON (INPUT_PULLUP)."],
  },
  buzzer: {
    wiring: ["pos → board pin, neg → GND."],
    code: "function setup(){ pinMode(8, OUTPUT); }\nfunction loop(){ tone(8, 440); delay(300); noTone(8); delay(300); }",
    mistakes: [],
  },
  potentiometer: {
    wiring: ["vcc → 5V, gnd → GND, wiper → an analog pin (A0–A5)."],
    code: "function loop(){ var v = analogRead(A0); /* 0–1023 */ }",
    mistakes: ["Wiper on a digital pin only gives HIGH/LOW."],
  },
  light_sensor: { wiring: ["vcc → 5V, gnd → GND, out → A0."], code: "function loop(){ var light = analogRead(A0); }", mistakes: [] },
  temp_sensor: { wiring: ["vcc → 5V, gnd → GND, out → A0."], code: "function loop(){ var raw = analogRead(A0); }", mistakes: [] },
  ir_sensor: {
    wiring: ["vcc → 5V, gnd → GND, out → a digital pin (D2, D3 …). Mount two sensors at the front, one each side of a line that is narrower than their spacing."],
    code: "function setup(){ pinMode(2, INPUT); }\nfunction loop(){ var onLine = digitalRead(2); /* HIGH over the dark line, LOW over the floor */ }",
    mistakes: ["Unpowered sensors read 0 — the robot is blind.", "Real modules differ in polarity; this simulated module reads HIGH over a dark line."],
  },
  hc_sr04: {
    wiring: ["vcc → 5V, gnd → GND, trig → a digital pin (OUTPUT), echo → a digital pin (INPUT)."],
    code: "function setup(){ pinMode(9, OUTPUT); pinMode(10, INPUT); }\nfunction loop(){\n  digitalWrite(9, LOW); delayMicroseconds(2);\n  digitalWrite(9, HIGH); delayMicroseconds(10); digitalWrite(9, LOW);\n  var us = pulseIn(10, HIGH);\n  var cm = us / 58;\n  delay(60);\n}",
    mistakes: ["Trigger pulse shorter than 10 µs: no echo.", "Measure no more often than every 60 ms.", "Objects closer than 2 cm or farther than 4 m, or soft/angled ones, give no echo (pulseIn returns 0)."],
  },
  servo: {
    wiring: ["vcc → 5V, gnd → GND, signal → a digital pin."],
    code: "function setup(){ pinMode(9, OUTPUT); }\nfunction loop(){ servoWrite(9, 0); delay(1000); servoWrite(9, 90); delay(1000); }",
    mistakes: ["Don't power a servo from a signal pin.", "SG90 moves 60° in 0.1 s: wait about 300 ms for a half turn."],
  },
  dc_motor: {
    wiring: ["Never wire a motor to a board pin. Connect its two legs (a, b) to one bridge of a motor driver (OUT1/OUT2 or OUT3/OUT4, AOUT1/AOUT2…). Wire all motors the same way so positive power means the same direction."],
    mistakes: ["Motor draws ~150 mA running and 1.5 A stalled; a pin gives ~20 mA.", "Over 6 V shortens its life; under ~3 V it is weak."],
  },
  battery: {
    wiring: ["minus → board GND (shared ground!), plus → the motor driver's motor-supply pin (VS on L298N, VM on TB6612)."],
    mistakes: ["Forgetting the shared ground: the driver then has no reference and nothing moves."],
  },
  l298n: {
    wiring: [
      "battery plus → vs; battery minus → gnd AND board GND (common ground); board 5V → v5.",
      "Bridge A: in1, in2 from board pins; motor between out1 and out2. Bridge B: in3, in4; motor between out3 and out4.",
      "ENA/ENB: leave unwired (module jumpers keep them HIGH) OR remove the jumper (jumperEnA: 0) and drive ENA with a PWM pin.",
      "Speed: analogWrite on in1 with in2 LOW (or on ENA with in1 HIGH, in2 LOW).",
    ],
    code: "function setup(){ pinMode(5, OUTPUT); pinMode(8, OUTPUT); }\nfunction loop(){\n  digitalWrite(8, LOW);      // in2 LOW\n  analogWrite(5, 200);       // in1 PWM: forward at ~78% duty\n}",
    mistakes: ["The bridge drops 2–3 V: a 6 V battery gives ~3.5 V at the motor.", "in1 = in2 brakes the motor (fast stop).", "No common ground, nothing moves."],
  },
  tb6612: {
    wiring: [
      "battery plus → vm; vcc and stby → board 5V; gnd → board GND (battery minus also to board GND).",
      "Channel A: ain1, ain2, pwma from board pins; motor between aout1 and aout2. Channel B: bin1, bin2, pwmb; bout1, bout2.",
    ],
    code: "function setup(){ pinMode(8, OUTPUT); pinMode(9, OUTPUT); pinMode(5, OUTPUT); }\nfunction loop(){\n  digitalWrite(8, HIGH); digitalWrite(9, LOW);  // IN1 H, IN2 L = clockwise\n  analogWrite(5, 200);                          // PWM = speed\n}",
    mistakes: ["STBY must be HIGH or the driver is in standby.", "PWM LOW = short brake; both INs HIGH = short brake; both LOW = stop."],
  },
  motor_driver: {
    wiring: ["Simplified generic driver: vcc → 5V, gnd → GND, in → PWM pin, out1/out2 → motor. Prefer the real L298N or TB6612FNG."],
    mistakes: ["Not datasheet-accurate (no voltage drop, no truth table)."],
  },
};
