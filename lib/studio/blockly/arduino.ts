import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as En from "blockly/msg/en";

/**
 * Scratch-style block coding for Maker Studio: drag blocks, snap them together, and they become a normal
 * Arduino C++ sketch that the board runs (the raw code tab shows the same sketch and can be edited
 * directly). Block programs written by the AI or a template are converted into the same workspace, so
 * every lab can be opened as blocks.
 */

// ------------------------------------------------------------------ pins

/** Pin choices a beginner sees: the board's labels, stored as numbers (A0–A5 = 14–19). */
export const DIGITAL_PINS: Array<[string, string]> = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => [`D${n}`, String(n)]);
export const PWM_PINS: Array<[string, string]> = [3, 5, 6, 9, 10, 11].map((n) => [`D${n}~`, String(n)]);
export const ANALOG_PINS: Array<[string, string]> = [0, 1, 2, 3, 4, 5].map((n) => [`A${n}`, String(14 + n)]);
const ANY_PINS: Array<[string, string]> = [...DIGITAL_PINS, ...ANALOG_PINS];

const pinExpr = (v: string | number): string => {
  const n = Number(v);
  return n >= 14 ? `A${n - 14}` : String(n);
};

// ------------------------------------------------------------------ block definitions

const COLOURS = { start: 40, pins: 20, wait: 195, logic: 210, loops: 120, math: 230, vars: 330, sound: 300, text: 160 };

Blockly.setLocale(En as unknown as { [key: string]: string });

let defined = false;
export function defineArduinoBlocks() {
  if (defined) return;
  defined = true;
  Blockly.defineBlocksWithJsonArray([
    { type: "arduino_setup", message0: "when the board starts (once) %1 %2", args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: COLOURS.start, tooltip: "Everything inside runs one time when the program starts.", deletable: false },
    { type: "arduino_loop", message0: "forever (again and again) %1 %2", args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: COLOURS.start, tooltip: "Everything inside repeats for as long as the program runs.", deletable: false },
    {
      type: "io_digital_write",
      message0: "turn pin %1 %2",
      args0: [
        { type: "field_dropdown", name: "PIN", options: ANY_PINS },
        { type: "field_dropdown", name: "STATE", options: [["ON", "HIGH"], ["OFF", "LOW"]] },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOURS.pins,
      tooltip: "Switch a pin fully on or off (an LED, a relay, a motor driver input…).",
    },
    {
      type: "io_analog_write",
      message0: "set power of pin %1 to %2 (0–255)",
      args0: [
        { type: "field_dropdown", name: "PIN", options: PWM_PINS },
        { type: "input_value", name: "VALUE", check: "Number" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOURS.pins,
      tooltip: "PWM: 0 is off, 255 is full power. Use it to dim an LED or set a motor's speed.",
    },
    { type: "io_analog_read", message0: "read knob / sensor on %1 (0–1023)", args0: [{ type: "field_dropdown", name: "PIN", options: ANALOG_PINS }], output: "Number", colour: COLOURS.pins, tooltip: "What a potentiometer or light sensor says right now, from 0 to 1023." },
    { type: "io_digital_read", message0: "read pin %1 (1 = HIGH, 0 = LOW)", args0: [{ type: "field_dropdown", name: "PIN", options: ANY_PINS }], output: "Number", colour: COLOURS.pins },
    {
      type: "io_button",
      message0: "button on pin %1 is %2",
      args0: [
        { type: "field_dropdown", name: "PIN", options: DIGITAL_PINS },
        { type: "field_dropdown", name: "STATE", options: [["pressed", "pressed"], ["released", "released"], ["HIGH", "high"], ["LOW", "low"]] },
      ],
      output: "Boolean",
      colour: COLOURS.pins,
      tooltip: "Buttons are wired between the pin and GND, so pressed reads LOW.",
    },
    { type: "io_delay", message0: "wait %1 ms", args0: [{ type: "input_value", name: "MS", check: "Number" }], previousStatement: null, nextStatement: null, colour: COLOURS.wait, tooltip: "Pause for this many milliseconds (1000 = one second)." },
    { type: "io_wait_until", message0: "wait until %1", args0: [{ type: "input_value", name: "COND", check: "Boolean" }], previousStatement: null, nextStatement: null, colour: COLOURS.wait },
    { type: "io_millis", message0: "milliseconds since start", output: "Number", colour: COLOURS.wait },
    {
      type: "io_tone",
      message0: "play sound on pin %1 at %2 Hz",
      args0: [
        { type: "field_dropdown", name: "PIN", options: DIGITAL_PINS },
        { type: "input_value", name: "HZ", check: "Number" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOURS.sound,
    },
    { type: "io_notone", message0: "stop sound on pin %1", args0: [{ type: "field_dropdown", name: "PIN", options: DIGITAL_PINS }], previousStatement: null, nextStatement: null, colour: COLOURS.sound },
    {
      type: "io_servo",
      message0: "turn servo on pin %1 to %2 °",
      args0: [
        { type: "field_dropdown", name: "PIN", options: DIGITAL_PINS },
        { type: "input_value", name: "ANGLE", check: "Number" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOURS.sound,
    },
    { type: "io_print", message0: "print %1", args0: [{ type: "input_value", name: "TEXT" }], previousStatement: null, nextStatement: null, colour: COLOURS.text, tooltip: "Shows a message (or a number) in the serial monitor." },
    {
      type: "io_map",
      message0: "rescale %1 from %2 – %3 to %4 – %5",
      args0: [
        { type: "input_value", name: "VALUE", check: "Number" },
        { type: "input_value", name: "IN_LOW", check: "Number" },
        { type: "input_value", name: "IN_HIGH", check: "Number" },
        { type: "input_value", name: "OUT_LOW", check: "Number" },
        { type: "input_value", name: "OUT_HIGH", check: "Number" },
      ],
      inputsInline: true,
      output: "Number",
      colour: COLOURS.math,
      tooltip: "Turns a reading from one range into another, e.g. a knob 0–1023 into brightness 0–255.",
    },
    { type: "code_expr", message0: "maths %1", args0: [{ type: "field_input", name: "EXPR", text: "level / 4" }], output: null, colour: COLOURS.math, tooltip: "Advanced: type a short expression using your variables." },
  ]);
}

// ------------------------------------------------------------------ C++ generator

const RESERVED = "setup,loop,int,float,void,if,else,for,while,return,delay,HIGH,LOW,INPUT,OUTPUT,pinMode,digitalWrite,digitalRead,analogRead,analogWrite,map,constrain,random,tone,noTone,millis,Serial,true,false,min,max,abs,pow,sqrt,A0,A1,A2,A3,A4,A5";

class ArduinoGenerator extends Blockly.CodeGenerator {
  pins = new Map<number, "OUTPUT" | "INPUT_PULLUP">();
  uses = new Set<string>();
  private counter = 0;

  constructor() {
    super("Arduino");
    this.addReservedWords(RESERVED);
  }

  nextLoopVar(): string {
    return `i${++this.counter}`;
  }

  override init(workspace: Blockly.Workspace) {
    super.init(workspace);
    this.pins = new Map();
    this.uses = new Set();
    this.counter = 0;
    if (!this.nameDB_) this.nameDB_ = new Blockly.Names(RESERVED);
    else this.nameDB_.reset();
    this.nameDB_.setVariableMap(workspace.getVariableMap());
    this.nameDB_.populateVariables(workspace);
  }

  /** Only the two hats make a program: loose blocks lying around the workspace don't run. */
  override workspaceToCode(workspace?: Blockly.Workspace): string {
    if (!workspace) return "";
    this.init(workspace);
    const tops = workspace.getTopBlocks(true);
    const setup = tops.find((b) => b.type === "arduino_setup");
    const loop = tops.find((b) => b.type === "arduino_loop");
    const setupBody = setup ? this.statementToCode(setup, "DO") : "";
    const loopBody = loop ? this.statementToCode(loop, "DO") : "";
    const pinLines = Array.from(this.pins.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([pin, mode]) => `${this.INDENT}pinMode(${pinExpr(pin)}, ${mode});\n`)
      .join("");
    const vars = workspace
      .getVariableMap().getAllVariables()
      .map((v) => `int ${this.nameDB_!.getName(v.getId(), Blockly.Names.NameType.VARIABLE)} = 0;\n`)
      .join("");
    const functions = tops
      .filter((b) => b.type === "procedures_defnoreturn" || b.type === "procedures_defreturn")
      .map((b) => this.functionToCode(b as ProcBlock))
      .join("\n");
    const code = `${vars}${vars ? "\n" : ""}${functions}${functions ? "\n" : ""}void setup() {\n${pinLines}${setupBody}}\n\nvoid loop() {\n${loopBody}}\n`;
    return code;
  }

  private functionToCode(b: Blockly.Block & { getProcedureDef(): [string, string[], boolean] }): string {
    const [name, args, returns] = b.getProcedureDef();
    const params = args.map((a) => `int ${this.nameDB_!.getName(a, Blockly.Names.NameType.VARIABLE)}`).join(", ");
    const body = this.statementToCode(b, "STACK");
    const ret = returns ? `${this.INDENT}return ${this.valueToCode(b, "RETURN", 99) || "0"};\n` : "";
    return `${returns ? "int" : "void"} ${this.nameDB_!.getName(name, Blockly.Names.NameType.PROCEDURE)}(${params}) {\n${body}${ret}}\n`;
  }

  override scrub_(block: Blockly.Block, code: string, thisOnly?: boolean): string {
    const next = block.nextConnection && block.nextConnection.targetBlock();
    return code + (next && !thisOnly ? this.blockToCode(next, false) : "");
  }
}

export const arduinoGenerator = new ArduinoGenerator();
const G = arduinoGenerator;
const ATOM = 0;
const NONE = 99;
const val = (b: Blockly.Block, name: string, fallback = "0") => G.valueToCode(b, name, NONE) || fallback;
const stmt = (b: Blockly.Block, name: string) => G.statementToCode(b, name);
const num = (b: Blockly.Block, name: string) => Number(b.getFieldValue(name));
const forBlock = G.forBlock as Record<string, (b: Blockly.Block, g: ArduinoGenerator) => string | [string, number] | null>;

forBlock["io_digital_write"] = (b) => {
  G.pins.set(num(b, "PIN"), "OUTPUT");
  return `digitalWrite(${pinExpr(b.getFieldValue("PIN"))}, ${b.getFieldValue("STATE")});\n`;
};
forBlock["io_analog_write"] = (b) => {
  G.pins.set(num(b, "PIN"), "OUTPUT");
  return `analogWrite(${pinExpr(b.getFieldValue("PIN"))}, constrain(${val(b, "VALUE")}, 0, 255));\n`;
};
forBlock["io_analog_read"] = (b) => [`analogRead(${pinExpr(b.getFieldValue("PIN"))})`, ATOM];
forBlock["io_digital_read"] = (b) => {
  const n = num(b, "PIN");
  if (n < 14) G.pins.set(n, "INPUT_PULLUP");
  return [`digitalRead(${pinExpr(n)})`, ATOM];
};
forBlock["io_button"] = (b) => {
  const n = num(b, "PIN");
  G.pins.set(n, "INPUT_PULLUP");
  const s = b.getFieldValue("STATE");
  return [`(digitalRead(${n}) == ${s === "pressed" || s === "low" ? "LOW" : "HIGH"})`, ATOM];
};
forBlock["io_delay"] = (b) => `delay(${val(b, "MS", "1000")});\n`;
forBlock["io_wait_until"] = (b) => `while (!(${val(b, "COND", "true")})) { delay(10); }\n`;
forBlock["io_millis"] = () => ["millis()", ATOM];
forBlock["io_tone"] = (b) => {
  G.pins.set(num(b, "PIN"), "OUTPUT");
  return `tone(${b.getFieldValue("PIN")}, ${val(b, "HZ", "440")});\n`;
};
forBlock["io_notone"] = (b) => `noTone(${b.getFieldValue("PIN")});\n`;
forBlock["io_servo"] = (b) => {
  G.pins.set(num(b, "PIN"), "OUTPUT");
  return `servoWrite(${b.getFieldValue("PIN")}, constrain(${val(b, "ANGLE", "90")}, 0, 180));\n`;
};
forBlock["io_print"] = (b) => `Serial.println(${val(b, "TEXT", '""')});\n`;
forBlock["io_map"] = (b) => [`map(${val(b, "VALUE")}, ${val(b, "IN_LOW", "0")}, ${val(b, "IN_HIGH", "1023")}, ${val(b, "OUT_LOW", "0")}, ${val(b, "OUT_HIGH", "255")})`, ATOM];
forBlock["code_expr"] = (b) => {
  const e = String(b.getFieldValue("EXPR") || "0").replace(/[^A-Za-z0-9_\s+\-*/%().,<>=!&|?:]/g, "");
  return [`(${e.trim() || "0"})`, ATOM];
};

forBlock["controls_if"] = (b) => {
  let n = 0;
  let code = "";
  do {
    code += `${n > 0 ? " else " : ""}if (${G.valueToCode(b, `IF${n}`, NONE) || "false"}) {\n${stmt(b, `DO${n}`)}}`;
    n++;
  } while (b.getInput(`IF${n}`));
  if (b.getInput("ELSE")) code += ` else {\n${stmt(b, "ELSE")}}`;
  return `${code}\n`;
};
forBlock["controls_repeat_ext"] = (b) => {
  const i = G.nextLoopVar();
  return `for (int ${i} = 0; ${i} < ${val(b, "TIMES", "10")}; ${i}++) {\n${stmt(b, "DO")}}\n`;
};
forBlock["controls_whileUntil"] = (b) => {
  const c = val(b, "BOOL", "false");
  return `while (${b.getFieldValue("MODE") === "UNTIL" ? `!(${c})` : c}) {\n${stmt(b, "DO")}}\n`;
};
forBlock["controls_for"] = (b) => {
  const v = G.getVariableName(b.getFieldValue("VAR"));
  const by = val(b, "BY", "1");
  return `for (${v} = ${val(b, "FROM", "1")}; ${v} <= ${val(b, "TO", "10")}; ${v} += ${by}) {\n${stmt(b, "DO")}}\n`;
};
forBlock["controls_flow_statements"] = (b) => (b.getFieldValue("FLOW") === "CONTINUE" ? "continue;\n" : "break;\n");

const CMP: Record<string, string> = { EQ: "==", NEQ: "!=", LT: "<", LTE: "<=", GT: ">", GTE: ">=" };
forBlock["logic_compare"] = (b) => [`(${val(b, "A")} ${CMP[b.getFieldValue("OP")] || "=="} ${val(b, "B")})`, ATOM];
forBlock["logic_operation"] = (b) => [`(${val(b, "A", "false")} ${b.getFieldValue("OP") === "OR" ? "||" : "&&"} ${val(b, "B", "false")})`, ATOM];
forBlock["logic_negate"] = (b) => [`!${val(b, "BOOL", "true")}`, ATOM];
forBlock["logic_boolean"] = (b) => [b.getFieldValue("BOOL") === "TRUE" ? "true" : "false", ATOM];
forBlock["math_number"] = (b) => [String(Number(b.getFieldValue("NUM")) || 0), ATOM];
const ARITH: Record<string, string> = { ADD: "+", MINUS: "-", MULTIPLY: "*", DIVIDE: "/" };
forBlock["math_arithmetic"] = (b) => {
  const op = b.getFieldValue("OP");
  return op === "POWER" ? [`pow(${val(b, "A")}, ${val(b, "B", "1")})`, ATOM] : [`(${val(b, "A")} ${ARITH[op] || "+"} ${val(b, "B", op === "DIVIDE" || op === "MULTIPLY" ? "1" : "0")})`, ATOM];
};
forBlock["math_modulo"] = (b) => [`(${val(b, "DIVIDEND")} % ${val(b, "DIVISOR", "1")})`, ATOM];
forBlock["math_constrain"] = (b) => [`constrain(${val(b, "VALUE")}, ${val(b, "LOW", "0")}, ${val(b, "HIGH", "100")})`, ATOM];
forBlock["math_random_int"] = (b) => [`random(${val(b, "FROM", "1")}, ${val(b, "TO", "100")} + 1)`, ATOM];
forBlock["variables_get"] = (b) => [G.getVariableName(b.getFieldValue("VAR")), ATOM];
forBlock["variables_set"] = (b) => `${G.getVariableName(b.getFieldValue("VAR"))} = ${val(b, "VALUE")};\n`;
forBlock["text"] = (b) => [JSON.stringify(String(b.getFieldValue("TEXT") ?? "")), ATOM];
forBlock["text_join"] = (b) => {
  const n = (b as unknown as { itemCount_?: number }).itemCount_ ?? 2;
  const parts = Array.from({ length: n }, (_, i) => `String(${G.valueToCode(b, `ADD${i}`, NONE) || '""'})`);
  return [parts.length ? `(${parts.join(" + ")})` : '""', ATOM];
};

// more of Blockly's standard maths and logic
forBlock["math_change"] = (b) => `${G.getVariableName(b.getFieldValue("VAR"))} += ${val(b, "DELTA", "1")};\n`;
forBlock["math_single"] = (b) => {
  const x = val(b, "NUM");
  const f: Record<string, string> = { ROOT: `sqrt(${x})`, ABS: `abs(${x})`, NEG: `(-(${x}))`, LN: `log(${x})`, LOG10: `(log(${x}) / log(10))`, EXP: `exp(${x})`, POW10: `pow(10, ${x})` };
  return [f[b.getFieldValue("OP")] || x, ATOM];
};
forBlock["math_round"] = (b) => {
  const fn = ({ ROUND: "round", ROUNDUP: "ceil", ROUNDDOWN: "floor" } as Record<string, string>)[b.getFieldValue("OP")] || "round";
  return [`${fn}(${val(b, "NUM")})`, ATOM];
};
forBlock["math_trig"] = (b) => {
  const op = b.getFieldValue("OP");
  const x = val(b, "NUM");
  // inverse functions take a ratio and return an angle (Blockly works in degrees)
  const inverse = ({ ASIN: "asin", ACOS: "acos", ATAN: "atan" } as Record<string, string>)[op];
  if (inverse) return [`degrees(${inverse}(${x}))`, ATOM];
  const fn = ({ SIN: "sin", COS: "cos", TAN: "tan" } as Record<string, string>)[op] || "sin";
  return [`${fn}(radians(${x}))`, ATOM];
};
forBlock["math_constant"] = (b) => [b.getFieldValue("CONSTANT") === "E" ? "2.718281828" : "PI", ATOM];
forBlock["math_number_property"] = (b) => {
  const n = val(b, "NUMBER_TO_CHECK");
  const p = b.getFieldValue("PROPERTY");
  const e: Record<string, string> = { EVEN: `(${n} % 2 == 0)`, ODD: `(${n} % 2 != 0)`, POSITIVE: `(${n} > 0)`, NEGATIVE: `(${n} < 0)`, DIVISIBLE_BY: `(${n} % ${val(b, "DIVISOR", "1")} == 0)` };
  return [e[p] || "false", ATOM];
};
forBlock["logic_ternary"] = (b) => [`(${val(b, "IF", "false")} ? ${val(b, "THEN")} : ${val(b, "ELSE")})`, ATOM];

// functions (Blockly's standard "procedure" blocks): written before setup() as typed C++ functions
type ProcBlock = Blockly.Block & { getProcedureDef(): [string, string[], boolean]; getProcedureCall(): string; arguments_?: string[]; hasReturnValue_?: boolean };
const procName = (n: string) => G.nameDB_!.getName(n, Blockly.Names.NameType.PROCEDURE);
const callArgs = (b: Blockly.Block) => ((b as ProcBlock).arguments_ || []).map((_, i) => val(b, `ARG${i}`)).join(", ");
forBlock["procedures_defnoreturn"] = () => null;
forBlock["procedures_defreturn"] = () => null;
forBlock["procedures_callnoreturn"] = (b) => `${procName((b as ProcBlock).getProcedureCall())}(${callArgs(b)});\n`;
forBlock["procedures_callreturn"] = (b) => [`${procName((b as ProcBlock).getProcedureCall())}(${callArgs(b)})`, ATOM];
forBlock["procedures_ifreturn"] = (b) => {
  const hasValue = !!(b as ProcBlock).hasReturnValue_;
  return `if (${val(b, "CONDITION", "false")}) {\n${G.INDENT}return${hasValue ? ` ${val(b, "VALUE")}` : ""};\n}\n`;
};

/** A workspace state (as saved by Blockly) → the Arduino sketch it makes. Works without a browser. */
export function blocklyToCode(state: unknown): string {
  defineArduinoBlocks();
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state as never, ws);
    return arduinoGenerator.workspaceToCode(ws);
  } finally {
    ws.dispose();
  }
}

// ------------------------------------------------------------------ toolbox

export function toolbox(): Blockly.utils.toolbox.ToolboxInfo {
  const block = (type: string, extra: Record<string, unknown> = {}) => ({ kind: "block", type, ...extra });
  const num = (n: number) => ({ shadow: { type: "math_number", fields: { NUM: n } } });
  return {
    kind: "categoryToolbox",
    contents: [
      { kind: "category", name: "Pins", colour: String(COLOURS.pins), contents: [block("io_digital_write"), block("io_analog_write", { inputs: { VALUE: num(200) } }), block("io_analog_read"), block("io_digital_read"), block("io_button")] },
      { kind: "category", name: "Wait", colour: String(COLOURS.wait), contents: [block("io_delay", { inputs: { MS: num(1000) } }), block("io_wait_until"), block("io_millis")] },
      { kind: "category", name: "Control", colour: String(COLOURS.loops), contents: [block("controls_if"), block("controls_if", { extraState: { hasElse: true } }), block("controls_repeat_ext", { inputs: { TIMES: num(3) } }), block("controls_whileUntil"), block("controls_for", { inputs: { FROM: num(1), TO: num(10), BY: num(1) } }), block("controls_flow_statements")] },
      { kind: "category", name: "Logic", colour: String(COLOURS.logic), contents: [block("logic_compare"), block("logic_operation"), block("logic_negate"), block("logic_boolean"), block("logic_ternary")] },
      {
        kind: "category",
        name: "Math",
        colour: String(COLOURS.math),
        contents: [
          block("math_number"),
          block("math_arithmetic", { inputs: { A: num(1), B: num(1) } }),
          block("math_modulo", { inputs: { DIVIDEND: num(10), DIVISOR: num(3) } }),
          block("io_map", { inputs: { IN_LOW: num(0), IN_HIGH: num(1023), OUT_LOW: num(0), OUT_HIGH: num(255) } }),
          block("math_constrain", { inputs: { LOW: num(0), HIGH: num(255) } }),
          block("math_random_int", { inputs: { FROM: num(1), TO: num(100) } }),
          block("math_single", { inputs: { NUM: num(9) } }),
          block("math_round", { inputs: { NUM: num(3.7) } }),
          block("math_trig", { inputs: { NUM: num(45) } }),
          block("math_number_property", { inputs: { NUMBER_TO_CHECK: num(7) } }),
          block("math_constant"),
          block("code_expr"),
        ],
      },
      { kind: "category", name: "Variables", colour: String(COLOURS.vars), custom: "VARIABLE" },
      { kind: "category", name: "Functions", colour: "290", custom: "PROCEDURE" },
      { kind: "category", name: "Sound & motion", colour: String(COLOURS.sound), contents: [block("io_tone", { inputs: { HZ: num(440) } }), block("io_notone"), block("io_servo", { inputs: { ANGLE: num(90) } })] },
      { kind: "category", name: "Message", colour: String(COLOURS.text), contents: [block("io_print"), block("text"), block("text_join")] },
    ],
  };
}
