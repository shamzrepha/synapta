import { describe, expect, it } from "vitest";
import { blocklyToCode } from "./arduino";
import { emptyBlockly, programToBlockly } from "./convert";
import { compileBlocks, type BlockProgram } from "../blocks";
import { BoardRuntime, circuitReader } from "../circuit/runtime";

const dimmer: BlockProgram = {
  setup: [],
  loop: [
    { id: "a", type: "readAnalog", pin: 14, name: "knob" },
    { id: "b", type: "map", name: "level", src: "knob", inLow: 0, inHigh: 1023, outLow: 0, outHigh: 255 },
    { id: "c", type: "pwm", pin: 9, value: 0, expr: "level" },
    { id: "d", type: "wait", ms: 10 },
  ],
};

const circuit = {
  parts: [
    { id: "board", type: "board", x: 0, y: 0 },
    { id: "pot", type: "potentiometer", x: 0, y: 0 },
  ],
  wires: [
    { id: "w1", from: "board.5V", to: "pot.vcc" },
    { id: "w2", from: "board.GND", to: "pot.gnd" },
    { id: "w3", from: "pot.wiper", to: "board.A0" },
  ],
};

describe("Scratch-style blocks (Blockly) → Arduino C++", () => {
  it("an empty workspace has the two hats and makes a valid empty sketch", () => {
    const code = blocklyToCode(emptyBlockly());
    expect(code).toContain("void setup()");
    expect(code).toContain("void loop()");
  });

  it("turns the AI's block program into stacked blocks that generate runnable code", () => {
    const code = blocklyToCode(programToBlockly(dimmer));
    expect(code).toContain("int knob = 0;");
    expect(code).toContain("knob = analogRead(A0);");
    expect(code).toContain("level = map(knob, 0, 1023, 0, 255);");
    expect(code).toContain("analogWrite(9, constrain((level), 0, 255));");
    expect(code).toContain("pinMode(9, OUTPUT);");
    for (const [raw, want] of [[0, 0], [512, 127], [1023, 255]] as const) {
      const rt = new BoardRuntime(code, circuitReader(circuit, { pressed: new Set(), values: { pot: raw } }));
      rt.advance(100);
      expect(rt.error).toBeNull();
      expect(rt.pins.pwm[9]).toBe(want);
    }
  });

  it("matches what the old block compiler would make, behaviour for behaviour", () => {
    const prog: BlockProgram = {
      setup: [],
      loop: [
        { id: "1", type: "if", cond: { kind: "pressed", pin: 2 }, then: [{ id: "2", type: "write", pin: 13, value: "HIGH" }], else: [{ id: "3", type: "write", pin: 13, value: "LOW" }] },
        { id: "4", type: "repeat", times: 2, body: [{ id: "5", type: "wait", ms: 5 }] },
      ],
    };
    const blocks = blocklyToCode(programToBlockly(prog));
    expect(blocks).toContain("if (");
    expect(blocks).toContain("digitalRead(2) == LOW");
    expect(blocks).toContain("pinMode(2, INPUT_PULLUP);");
    expect(blocks).toContain("else {");
    expect(blocks).toContain("for (int i1 = 0; i1 < 2; i1++)");
    const rt = new BoardRuntime(blocks, circuitReader({ parts: [{ id: "board", type: "board", x: 0, y: 0 }], wires: [] }, { pressed: new Set(), values: {} }));
    rt.advance(50);
    expect(rt.error).toBeNull();
    expect(compileBlocks(prog)).toContain("void loop()");
  });

  it("ignores loose blocks that aren't under a hat", () => {
    const state = programToBlockly({ setup: [], loop: [] });
    state.blocks.blocks.push({ type: "io_digital_write", x: 5, y: 300, fields: { PIN: "13", STATE: "HIGH" } });
    expect(blocklyToCode(state)).not.toContain("digitalWrite");
  });
});

describe("more of Blockly's standard blocks", () => {
  const hats = (loop: unknown[], extra: unknown[] = [], moreVars: Array<{ name: string; id: string }> = []) => ({
    blocks: {
      languageVersion: 0,
      blocks: [
        { type: "arduino_setup", x: 0, y: 0 },
        { type: "arduino_loop", x: 0, y: 120, inputs: { DO: { block: chain(loop) } } },
        ...extra,
      ],
    },
    variables: [{ name: "n", id: "v_n" }, ...moreVars],
  });
  const chain = (list: unknown[]): Record<string, unknown> => list.reduceRight<Record<string, unknown> | undefined>((next, b) => (next ? { ...(b as object), next: { block: next } } : (b as Record<string, unknown>)), undefined)!;
  const num = (n: number) => ({ block: { type: "math_number", fields: { NUM: n } } });

  it("maths, rounding and a conditional expression", () => {
    const code = blocklyToCode(
      hats([
        { type: "variables_set", fields: { VAR: { id: "v_n" } }, inputs: { VALUE: { block: { type: "math_round", fields: { OP: "ROUNDUP" }, inputs: { NUM: num(3.2) } } } } },
        { type: "math_change", fields: { VAR: { id: "v_n" } }, inputs: { DELTA: num(2) } },
        { type: "io_print", inputs: { TEXT: { block: { type: "logic_ternary", inputs: { IF: { block: { type: "logic_boolean", fields: { BOOL: "TRUE" } } }, THEN: num(1), ELSE: num(2) } } } } },
      ])
    );
    expect(code).toContain("n = ceil(3.2);");
    expect(code).toContain("n += 2;");
    expect(code).toContain("Serial.println((true ? 1 : 2));");
    const rt = new BoardRuntime(code, circuitReader(circuit, { pressed: new Set(), values: {} }));
    rt.advance(50);
    expect(rt.error).toBeNull();
  });

  it("functions are written before setup and can be called", () => {
    const code = blocklyToCode(
      hats(
        [{ type: "procedures_callnoreturn", extraState: { name: "flash", params: [] } }],
        [
          {
            type: "procedures_defnoreturn",
            x: 300,
            y: 0,
            extraState: { procedureId: "p1", params: [] },
            fields: { NAME: "flash" },
            inputs: { STACK: { block: { type: "io_digital_write", fields: { PIN: "13", STATE: "HIGH" } } } },
          },
        ]
      )
    );
    expect(code).toMatch(/void flash\(\) \{\s*digitalWrite\(13, HIGH\);\s*\}/);
    expect(code.indexOf("void flash")).toBeLessThan(code.indexOf("void setup"));
    expect(code).toContain("flash();");
    const rt = new BoardRuntime(code, circuitReader(circuit, { pressed: new Set(), values: {} }));
    rt.advance(50);
    expect(rt.error).toBeNull();
    expect(rt.pins.level[13]).toBe(1);
  });

  it("a function with a parameter that returns a value", () => {
    const code = blocklyToCode(
      hats(
        [
          {
            type: "variables_set",
            fields: { VAR: { id: "v_n" } },
            inputs: { VALUE: { block: { type: "procedures_callreturn", extraState: { name: "double", params: ["x"] }, inputs: { ARG0: num(21) } } } },
          },
          { type: "io_print", inputs: { TEXT: { block: { type: "variables_get", fields: { VAR: { id: "v_n" } } } } } },
        ],
        [
          {
            type: "procedures_defreturn",
            x: 300,
            y: 0,
            extraState: { procedureId: "p2", params: [{ name: "x", id: "v_x", argId: "a_x" }] },
            fields: { NAME: "double" },
            inputs: { RETURN: { block: { type: "math_arithmetic", fields: { OP: "MULTIPLY" }, inputs: { A: { block: { type: "variables_get", fields: { VAR: { id: "v_x" } } } }, B: num(2) } } } },
          },
        ],
        [{ name: "x", id: "v_x" }]
      )
    );
    expect(code).toContain("int double(int x)");
    expect(code).toContain("n = double(21);");
    const rt = new BoardRuntime(code, circuitReader(circuit, { pressed: new Set(), values: {} }));
    rt.advance(50);
    expect(rt.error).toBeNull();
    expect(rt.serial.map((x) => x.text).join("")).toContain("42");
  });
});

