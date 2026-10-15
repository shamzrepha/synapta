import { describe, it, expect } from "vitest";
import { compileBlocks, newBlock, type BlockProgram } from "./blocks";
import { parseSpec } from "./spec";
import { BoardRuntime, circuitReader } from "./circuit/runtime";

const circuit = { parts: [{ id: "board", type: "board", x: 0, y: 0 }], wires: [] };

describe("block coding", () => {
  const program: BlockProgram = {
    setup: [],
    loop: [
      { id: "1", type: "if", cond: { kind: "pressed", pin: 2 }, then: [{ id: "2", type: "pwm", pin: 5, value: 200 }], else: [{ id: "3", type: "pwm", pin: 5, value: 0 }] },
      { id: "4", type: "wait", ms: 20 },
    ],
  };

  it("compiles to code that sets pin modes automatically", () => {
    const code = compileBlocks(program);
    expect(code).toContain("pinMode(5, OUTPUT);");
    expect(code).toContain("pinMode(2, INPUT_PULLUP);");
    expect(code).toContain("analogWrite(5, 200);");
  });

  it("runs on the board runtime and reacts to a button", () => {
    const inputs = { pressed: new Set<string>(), values: {} as Record<string, number> };
    const rt = new BoardRuntime(compileBlocks(program), circuitReader({ ...circuit, parts: [...circuit.parts, { id: "btn", type: "button", x: 0, y: 0 }], wires: [{ id: "w1", from: "board.D2", to: "btn.a" }, { id: "w2", from: "btn.b", to: "board.GND" }] }, inputs));
    rt.advance(100);
    expect(rt.error).toBeNull();
    expect(rt.pins.pwm?.[5] ?? 0).toBe(0);
    inputs.pressed.add("btn");
    rt.advance(300);
    expect(rt.pins.pwm?.[5]).toBe(200);
  });

  it("supports repeat, waitUntil, print and validates in a spec", () => {
    const prog: BlockProgram = { setup: [], loop: [{ id: "r", type: "repeat", times: 2, body: [newBlock("write"), newBlock("wait")] }, newBlock("waitUntil"), newBlock("print")] };
    const code = compileBlocks(prog);
    expect(code).toContain("for (var i1 = 0; i1 < 2; i1++)");
    const rt = new BoardRuntime(code, () => 1);
    rt.advance(2500);
    expect(rt.error).toBeNull();
    const spec = parseSpec({ kind: "circuit", blocks: prog, codeMode: "blocks", code });
    expect(spec.blocks?.loop).toHaveLength(3);
  });
});
