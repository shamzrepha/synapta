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
    type: "stepper",
    name: "28BYJ-48 stepper motor with ULN2003 driver board",
    maker: "28BYJ-48 (Kiatronics datasheet) + Texas Instruments ULN2003A driver",
    partNumber: "28BYJ-48 – 5V + ULN2003A",
    summary: "A geared 5 V unipolar stepper. The four coils are switched by the ULN2003 (seven Darlington transistors): a HIGH on IN1–IN4 energises that coil. Energise the coils in sequence and the shaft turns one small step at a time — about 4096 half-steps for one turn of the output shaft — so it holds its position without feedback.",
    sources: [
      { id: "28byj", title: "28BYJ-48 – 5V stepper motor datasheet (Kiatronics)", url: "https://components101.com/sites/default/files/component_datasheet/28byj48-step-motor-datasheet.pdf", kind: "datasheet" },
      { id: "uln2003", title: "TI ULN2002A / ULN2003A / ULN2004A datasheet (SLRS027T, March 2025)", url: "https://www.ti.com/lit/ds/symlink/uln2003a.pdf", kind: "datasheet" },
      { id: "28byj-page", title: "Components101 28BYJ-48 page (coil layout, wire colours)", url: "https://components101.com/motors/28byj-48-stepper-motor", kind: "product" },
    ],
    facts: [
      { label: "Rated voltage", value: "5 V DC, 4 phases", src: "28byj" },
      { label: "Speed variation ratio (gearbox)", value: "1/64", src: "28byj" },
      { label: "Stride angle", value: "5.625° / 64", src: "28byj" },
      { label: "Frequency", value: "100 Hz", src: "28byj" },
      { label: "DC resistance per coil", value: "50 Ω ± 7 % (25 °C)", src: "28byj" },
      { label: "Idle in-traction / out-traction frequency", value: "> 600 Hz / > 1000 Hz", src: "28byj" },
      { label: "Pull-in torque", value: "300 gf·cm", src: "28byj" },
      { label: "In-traction torque", value: "> 34.3 mN·m (120 Hz)", src: "28byj" },
      { label: "Coil wiring", value: "One end of all four coils is tied to the red wire (+5 V); the other ends are orange, pink, yellow and blue. A coil is energised when its far end is pulled to ground.", src: "28byj-page" },
      { label: "ULN2003A outputs", value: "Seven NPN Darlington pairs, 500 mA per output, 50 V, clamp diodes; 2.7 kΩ base resistor for TTL / 5 V CMOS inputs", src: "uln2003" },
      { label: "ULN2003A saturation", value: "VCE(sat) 0.9 V typ at IC = 100 mA, 1.0 V typ at 200 mA, 1.2 V typ at 350 mA", src: "uln2003" },
      { label: "ULN2003A ON-state input voltage", value: "2.4 V max for IC = 200 mA (VCE = 2 V)", src: "uln2003" },
      { label: "Steps per output turn (simulated)", value: "64 half-steps per motor-shaft turn (360° ÷ 5.625°) × 64 (1/64 gearbox) = 4096 half-steps; 2048 in full-step mode (four patterns)", src: "28byj", approx: true },
      { label: "Step rate limit (simulated)", value: "Pattern changes closer together than 1 ms (> 1000 Hz, the out-traction frequency) are too fast for the rotor and are skipped", src: "28byj", approx: true },
    ],
    dimsMm: null,
    logic: {
      title: "Half-step coil sequence (1 = IN pin HIGH = coil energised); 8 patterns = one electrical cycle",
      rows: [
        ["Step", "IN1", "IN2", "IN3", "IN4"],
        ["1", "1", "0", "0", "0"],
        ["2", "1", "1", "0", "0"],
        ["3", "0", "1", "0", "0"],
        ["4", "0", "1", "1", "0"],
        ["5", "0", "0", "1", "0"],
        ["6", "0", "0", "1", "1"],
        ["7", "0", "0", "0", "1"],
        ["8", "1", "0", "0", "1"],
      ],
      src: "28byj-page",
    },
    warnings: [
      "No machine-readable body dimensions were available (the datasheet drawing is an image), so the 3D model is illustrative.",
      "Run it from 5 V; the coils draw far more than a board pin gives, which is why the ULN2003 board sits between the board and the motor.",
      "Going from step 1 to 8 reverses the direction. Skipping patterns or switching faster than ~1 kHz makes the rotor miss steps.",
    ],
    imageQuery: "28BYJ-48 stepper motor ULN2003 driver board",
    verifiedOn: ON,
  },
  {
    type: "oled",
    name: "SSD1306 128×64 OLED display (I2C)",
    maker: "Solomon Systech SSD1306 controller on an I2C module",
    partNumber: "SSD1306",
    summary: "A tiny 128 × 64 pixel OLED. The SSD1306 chip keeps the picture in its own memory (GDDRAM) and your board talks to it over I2C with just SDA and SCL. The memory is eight pages of 8 rows, so text is usually drawn as eight lines.",
    sources: [
      { id: "ssd1306", title: "SSD1306 Advance Information datasheet, Rev 1.1 (Solomon Systech, Apr 2008)", url: "https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf", kind: "datasheet" },
      { id: "uno-ds", title: "Arduino UNO R3 datasheet (A000066)", url: "https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf", kind: "datasheet" },
    ],
    facts: [
      { label: "Resolution", value: "128 × 64 dot matrix", src: "ssd1306" },
      { label: "Supply", value: "VDD = 1.65 V to 3.3 V for the IC logic; VCC = 7 V to 15 V for panel driving (breakout modules add the regulators and charge pump)", src: "ssd1306" },
      { label: "Interfaces", value: "8-bit 6800 / 8080 parallel, 3- and 4-wire SPI, I2C", src: "ssd1306" },
      { label: "I2C slave address", value: "0111100 or 0111101 (0x3C or 0x3D) chosen by the SA0 pin", src: "ssd1306" },
      { label: "Display memory (GDDRAM)", value: "128 × 64 bits in eight pages (PAGE0–PAGE7)", src: "ssd1306" },
      { label: "Contrast", value: "256-step brightness control, register 81h", src: "ssd1306" },
      { label: "Board I2C pins", value: "Uno R3: A4 = SDA, A5 = SCL", src: "uno-ds" },
      { label: "Text layout (simulated)", value: "8 lines (64 rows ÷ 8-row pages) of 21 characters (128 columns ÷ 6-pixel 5×7 font cell)", src: "ssd1306", approx: true },
    ],
    dimsMm: null,
    warnings: [
      "Module size and pin order vary between sellers and no machine-readable module drawing was read, so the 3D model is illustrative.",
      "The chip is a 3.3 V part: use a module with an on-board regulator when you power it from 5 V.",
      "SDA and SCL must go to the board's hardware I2C pins (A4 and A5 on the Uno).",
    ],
    imageQuery: "SSD1306 0.96 inch OLED display I2C module",
    verifiedOn: ON,
  },
  {
    type: "dht11",
    name: "DHT11 temperature and humidity sensor",
    maker: "Aosong (Guangzhou Aosong Electronics)",
    partNumber: "DHT11",
    summary: "A digital sensor with a calibrated resistive humidity element and an NTC thermometer behind a small controller. It answers a start signal on one wire with 40 bits: humidity and temperature as whole numbers plus a checksum. It is slow and coarse (whole degrees, once a second at most) but needs no analog maths.",
    sources: [{ id: "dht11", title: "DHT11 digital temperature and humidity sensor datasheet (Aosong, Chinese edition)", url: "https://cdn-shop.adafruit.com/datasheets/DHT11-chinese.pdf", kind: "datasheet" }],
    facts: [
      { label: "Measuring range", value: "Humidity 20–90 %RH; temperature 0–50 °C", src: "dht11" },
      { label: "Accuracy", value: "Humidity ±5 %RH (±4 %RH at 25 °C); temperature ±2 °C", src: "dht11" },
      { label: "Resolution", value: "1 %RH and 1 °C (8 bit each)", src: "dht11" },
      { label: "Supply", value: "3 – 5.5 V DC; wait 1 s after power-up before sending commands", src: "dht11" },
      { label: "Supply current", value: "0.5 mA (typ) up to 2.5 mA while measuring; 0.2 – 1 mA average; 100 – 150 µA standby", src: "dht11" },
      { label: "Sampling period", value: "No more than once per second", src: "dht11" },
      { label: "Data frame", value: "40 bits, MSB first: 8-bit humidity integer + 8-bit humidity decimal + 8-bit temperature integer + 8-bit temperature decimal + 8-bit checksum (the last 8 bits of the sum of the first four bytes)", src: "dht11" },
      { label: "Start signal", value: "The MCU pulls the data line LOW for more than 18 ms; the sensor answers with an 80 µs LOW then an 80 µs HIGH", src: "dht11" },
      { label: "Pull-up", value: "5 kΩ pull-up on DATA for cables shorter than 20 m", src: "dht11" },
      { label: "Pins (4-pin part)", value: "1 VDD, 2 DATA, 3 NC (leave open), 4 GND", src: "dht11" },
      { label: "Response time", value: "Humidity 10 s typ (1/e, 1 m/s air); temperature 6 – 30 s", src: "dht11" },
    ],
    dimsMm: null,
    logic: {
      title: "One reading on the DATA wire",
      rows: [["Step", "What happens"], ["1", "MCU pulls DATA LOW ≥ 18 ms, releases"], ["2", "DHT11 answers LOW 80 µs, HIGH 80 µs"], ["3", "40 data bits, each starting with 50 µs LOW; HIGH time decides 0 or 1"], ["4", "Checksum = last 8 bits of the sum of the 4 data bytes"]],
      src: "dht11",
    },
    warnings: [
      "The datasheet drawing of the package is an image, so the body size was not read and the 3D model is illustrative.",
      "Read it at most once per second; faster polling gives stale or failed readings.",
      "Avoid condensation and long sunlight/UV exposure (datasheet notes).",
    ],
    imageQuery: "DHT11 temperature humidity sensor module",
    verifiedOn: ON,
  },
  {
    type: "relay",
    name: "5 V relay module (SRD-05VDC-SL-C)",
    maker: "Songle SRD relay on a 1-channel module",
    partNumber: "SRD-05VDC-SL-C",
    summary: "A relay is a switch worked by a coil. The module's IN pin energises the 5 V coil (through a transistor on the board); the contacts then connect COM to NO (normally open) while energised, and COM to NC (normally closed) when not. The contacts are electrically separate from the board, so they can switch a lamp, motor or battery circuit.",
    sources: [
      { id: "srd", title: "Songle SRD relay datasheet", url: "https://www.circuitbasics.com/wp-content/uploads/2015/11/SRD-05VDC-SL-C-Datasheet.pdf", kind: "datasheet" },
      { id: "srd-c101", title: "5 V relay datasheet (Components101 copy of the Songle SRD)", url: "https://components101.com/sites/default/files/component_datasheet/5V%20Relay%20Datasheet.pdf", kind: "datasheet" },
    ],
    facts: [
      { label: "Coil, 5 VDC standard sensitivity", value: "89.3 mA nominal, 55 Ω ±10 %, about 0.45 W", src: "srd" },
      { label: "Pull-in voltage", value: "75 % of nominal max (3.75 V for the 5 V coil)", src: "srd" },
      { label: "Drop-out voltage", value: "10 % of nominal min (0.5 V)", src: "srd" },
      { label: "Max allowable coil voltage", value: "110 % (standard sensitivity)", src: "srd" },
      { label: "Contact form", value: "Form C: one common (COM) with a normally-open (NO) and a normally-closed (NC) contact", src: "srd" },
      { label: "Contact capacity, resistive load (Form C)", value: "7 A 28 VDC; 10 A 125 VAC; 7 A 240 VAC", src: "srd" },
      { label: "Max allowable voltage", value: "250 VAC / 110 VDC", src: "srd" },
      { label: "Operate / release time", value: "10 ms max / 5 ms max", src: "srd" },
      { label: "Contact resistance", value: "100 mΩ max", src: "srd" },
      { label: "Life", value: "At least 10^7 operations with no load, 10^5 at rated load", src: "srd" },
      { label: "Weight", value: "about 10 g", src: "srd" },
    ],
    dimsMm: null,
    logic: {
      title: "Contacts follow the coil",
      rows: [["Coil", "COM–NO", "COM–NC"], ["Energised (IN at the module's active level)", "Connected", "Open"], ["Not energised", "Open", "Connected"]],
      src: "srd",
    },
    warnings: [
      "No datasheet for the module board itself was available: whether IN energises the coil with a LOW or a HIGH signal depends on the module (many opto-isolated modules are active LOW). The simulator has an 'Active level' setting; check yours.",
      "The relay only decides which wires touch. Never switch mains with a breadboard build; the datasheet ratings are for proper wiring and enclosures.",
      "A relay coil is an inductor: real modules have a flyback diode; a bare coil needs one.",
      "The datasheet dimension drawing is an image, so the 3D model is illustrative.",
    ],
    imageQuery: "5V relay module 1 channel SRD-05VDC-SL-C",
    verifiedOn: ON,
  },
  {
    type: "mpu6050",
    name: "MPU-6050 accelerometer and gyroscope (GY-521 style module)",
    maker: "InvenSense (TDK)",
    partNumber: "MPU-6050",
    summary: "A six-axis motion chip: a 3-axis accelerometer and a 3-axis gyroscope, read over I2C. At rest the accelerometer feels gravity (1 g), so the three readings tell you how the board is tilted. In the default range of ±2 g one unit is 1/16384 g.",
    sources: [
      { id: "mpu-ps", title: "MPU-6000 / MPU-6050 Product Specification, Rev 3.4 (InvenSense, 08/19/2013)", url: "https://components101.com/sites/default/files/component_datasheet/MPU6050-DataSheet.pdf", kind: "datasheet" },
      { id: "mpu-rm", title: "MPU-6000 / MPU-6050 Register Map and Descriptions, Rev 4.0", url: "https://cdn.sparkfun.com/datasheets/Sensors/Accelerometers/RM-MPU-6000A.pdf", kind: "datasheet" },
      { id: "uno-ds", title: "Arduino UNO R3 datasheet (A000066)", url: "https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf", kind: "datasheet" },
    ],
    facts: [
      { label: "Accelerometer full-scale range", value: "±2 g, ±4 g, ±8 g or ±16 g (AFS_SEL 0–3)", src: "mpu-ps" },
      { label: "Accelerometer sensitivity", value: "16,384 LSB/g at ±2 g; 8,192 at ±4 g; 4,096 at ±8 g; 2,048 at ±16 g; 16-bit two's complement output", src: "mpu-ps" },
      { label: "Gyroscope full-scale range", value: "±250, ±500, ±1000, ±2000 °/s; 131 LSB/(°/s) at ±250", src: "mpu-ps" },
      { label: "Supply (chip)", value: "VDD 2.375 V – 3.46 V; VLOGIC 1.71 V to VDD. Breakout boards add a regulator for 5 V boards.", src: "mpu-ps" },
      { label: "Operating current", value: "3.9 mA with gyroscope, accelerometer and DMP running; accelerometer alone 500 µA", src: "mpu-ps" },
      { label: "I2C address", value: "1101000 (0x68) with AD0 LOW, 1101001 (0x69) with AD0 HIGH", src: "mpu-ps" },
      { label: "Output rate", value: "Accelerometer sample rate 1 kHz; gyroscope up to 8 kHz", src: "mpu-ps" },
      { label: "Chip package", value: "QFN 4 × 4 × 0.9 mm", src: "mpu-ps" },
      { label: "Axes", value: "The datasheet's 'Orientation of Axes' figure defines +X, +Y, +Z and the rotation direction relative to pin 1", src: "mpu-ps" },
      { label: "Board I2C pins", value: "Uno R3: A4 = SDA, A5 = SCL", src: "uno-ds" },
      { label: "Tilt model (simulated)", value: "Flat and still: X = 0 g, Y = 0 g, Z = +1 g (the simulator's convention). Tilt angles split the 1 g between axes (aX = sin θx, aY = cos θx · sin θy, aZ = cos θx · cos θy); readings are rounded to 1/16384 g", src: "mpu-ps", approx: true },
    ],
    dimsMm: null,
    warnings: [
      "The GY-521 module board is not described in the product specification, so its size is not in the 3D model (the chip alone is 4 × 4 × 0.9 mm).",
      "Accelerometer readings include gravity: a motionless board still reads 1 g in total.",
      "SDA and SCL must go to A4 and A5 on the Uno.",
    ],
    imageQuery: "MPU-6050 GY-521 accelerometer gyro module",
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
