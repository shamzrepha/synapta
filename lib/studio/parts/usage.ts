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
  stepper: {
    wiring: [
      "ULN2003 board: 5V → vcc, GND → gnd (the supply's minus is also the board GND). in1, in2, in3, in4 → four board pins (e.g. D8, D9, D10, D11).",
      "The 5-pin motor plug goes into the ULN2003 board; the simulator treats motor + driver as one part.",
      "stepperRun(in1, in2, in3, in4, steps, msPerStep) runs the half-step sequence for you (negative steps reverse). 4096 half-steps = one turn of the output shaft.",
      "Or drive the pins yourself: HIGH on a pin energises its coil. Sequence (IN1..IN4): 1000, 1100, 0100, 0110, 0010, 0011, 0001, 1001, then repeat.",
    ],
    code: "function setup(){ }\nfunction loop(){\n  stepperRun(8, 9, 10, 11, 512, 2);   // 512 half-steps = 1/8 turn, 2 ms apart\n  delay(500);\n  stepperRun(8, 9, 10, 11, -512, 2);  // and back\n  delay(500);\n}",
    mistakes: [
      "Wait at least 1 ms between steps: faster than ~1 kHz the rotor cannot follow and skips steps (datasheet out-traction frequency > 1000 Hz).",
      "Skipping phases (for example 1000 then 0010) or energising opposite coils together makes the rotor lose its place.",
      "Power the ULN2003 board from 5 V with a shared ground; a board pin cannot drive the coils.",
    ],
  },
  oled: {
    wiring: ["vcc → 3V3 (or 5V on a module with a regulator), gnd → GND, sda → A4, scl → A5 (the Uno's hardware I2C pins)."],
    code: "function setup(){\n  oledClear();\n  oledPrint('Hello Sunroot');\n  oledPrint('Line two');\n}\nfunction loop(){\n  oledText(3, 'ms: ' + millis());\n  delay(200);\n}",
    mistakes: [
      "SDA and SCL on any other pins: nothing is drawn.",
      "8 lines of 21 characters fit on the 128×64 screen; longer text is cut, older lines scroll off.",
      "The SSD1306 logic runs at up to 3.3 V: use a module with a regulator on 5 V.",
    ],
  },
  dht11: {
    wiring: ["vcc → 5V, gnd → GND, data → a digital pin (D2…). A 5 kΩ pull-up on DATA is built into most 3-pin modules."],
    code: "function setup(){ Serial.begin(9600); }\nfunction loop(){\n  var t = dhtTemperature(2);   // whole degrees C, 0–50\n  var h = dhtHumidity(2);      // whole % RH, 20–90\n  Serial.println('T=' + t + ' H=' + h);\n  delay(1000);               // at most one reading per second\n}",
    mistakes: ["Reading more than once per second (the datasheet's sampling period).", "Values are whole numbers: ±2 °C and ±5 %RH, outside 0–50 °C / 20–90 %RH they are not reliable.", "An unpowered or unwired sensor gives NaN."],
  },
  relay: {
    wiring: [
      "Control side: vcc → 5V, gnd → GND, in → a board pin.",
      "Load side (isolated from the board): battery plus → com; no → the load's positive (e.g. a resistor then an LED anode); load's negative → battery minus (and the board GND in the simulator). com–no connect while the coil is energised, com–nc while it is not.",
      "Many modules energise on a LOW signal (the 'Active level' setting activeLow = 1, the default); set activeLow = 0 for a HIGH-triggered module.",
    ],
    code: "function setup(){ pinMode(7, OUTPUT); digitalWrite(7, HIGH); }  // HIGH = off on an active-LOW module\nfunction loop(){\n  digitalWrite(7, LOW);  delay(1000);   // energise: COM connects to NO\n  digitalWrite(7, HIGH); delay(1000);   // release: COM connects to NC\n}",
    mistakes: ["The coil needs the module's own 5 V (VCC), not just the signal.", "Using the wrong active level: it clicks the opposite way round.", "Do not switch mains on a breadboard; the relay is rated 7 A 28 VDC / 10 A 125 VAC on its own, with proper wiring."],
  },
  mpu6050: {
    wiring: ["vcc → 3V3 (or 5V on a GY-521 module), gnd → GND, sda → A4, scl → A5."],
    code: "function setup(){ Serial.begin(9600); }\nfunction loop(){\n  var ax = accelX(), ay = accelY(), az = accelZ();   // in g\n  Serial.println(ax + ' ' + ay + ' ' + az);\n  delay(200);\n}",
    mistakes: ["Readings include gravity: a still board is 1 g in total, flat = Z about +1 g.", "SDA/SCL on the wrong pins: the readings stay 0.", "Default range is ±2 g (16384 LSB/g); hard shakes clip."],
  },
  motor_driver: {
    wiring: ["Simplified generic driver: vcc → 5V, gnd → GND, in → PWM pin, out1/out2 → motor. Prefer the real L298N or TB6612FNG."],
    mistakes: ["Not datasheet-accurate (no voltage drop, no truth table)."],
  },
};
