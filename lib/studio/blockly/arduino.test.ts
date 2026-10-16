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
