import type { Block, BlockProgram, Cond } from "../blocks";

/** Pure data conversion (no Blockly import), so pages can use it without loading the block editor. */
// ------------------------------------------------------------------ typed block program → workspace

type B = Record<string, unknown>;

/** Converts the block program the AI and templates write into a Blockly workspace state, so every lab opens as blocks. */
export function programToBlockly(program: BlockProgram): { blocks: { languageVersion: number; blocks: B[] }; variables: Array<{ name: string; id: string }> } {
  const vars = new Map<string, string>();
  const varId = (name: string) => {
    if (!vars.has(name)) vars.set(name, `v_${name}`);
    return vars.get(name)!;
  };
  const numBlock = (n: number): B => ({ type: "math_number", fields: { NUM: n } });
  const exprBlock = (e: string): B => ({ type: "code_expr", fields: { EXPR: e } });
  const valueOf = (n: number, expr?: string): B => (expr && expr.trim() ? exprBlock(expr.trim()) : numBlock(n));
  const cond = (c: Cond): B => {
    switch (c.kind) {
      case "analog":
        return { type: "logic_compare", fields: { OP: c.op === ">" ? "GT" : "LT" }, inputs: { A: { block: { type: "io_analog_read", fields: { PIN: String(c.pin) } } }, B: { block: numBlock(c.value) } } };
      case "expr":
        return exprBlock(c.expr);
      default:
        return { type: "io_button", fields: { PIN: String(c.pin), STATE: c.kind } };
    }
  };
  const chain = (list: Block[]): B | undefined => {
    let head: B | undefined;
    let tail: B | undefined;
    for (const b of list) {
      const blk = one(b);
      if (!head) head = blk;
      else tail!.next = { block: blk };
      tail = blk;
    }
    return head;
  };
  const stack = (list: Block[]) => {
    const c = chain(list);
    return c ? { block: c } : undefined;
  };
  const one = (b: Block): B => {
    switch (b.type) {
      case "write":
        return { type: "io_digital_write", fields: { PIN: String(b.pin), STATE: b.value } };
      case "pwm":
        return { type: "io_analog_write", fields: { PIN: String(b.pin) }, inputs: { VALUE: { block: valueOf(b.value, b.expr) } } };
      case "wait":
        return { type: "io_delay", inputs: { MS: { block: valueOf(b.ms, b.expr) } } };
      case "tone":
        return { type: "io_tone", fields: { PIN: String(b.pin) }, inputs: { HZ: { block: valueOf(b.hz, b.expr) } } };
      case "noTone":
        return { type: "io_notone", fields: { PIN: String(b.pin) } };
      case "servo":
        return { type: "io_servo", fields: { PIN: String(b.pin) }, inputs: { ANGLE: { block: valueOf(b.angle, b.expr) } } };
      case "print":
        return { type: "io_print", inputs: { TEXT: { block: { type: "text", fields: { TEXT: b.text } } } } };
      case "readAnalog":
        return { type: "variables_set", fields: { VAR: { id: varId(b.name) } }, inputs: { VALUE: { block: { type: "io_analog_read", fields: { PIN: String(b.pin) } } } } };
      case "set":
        return { type: "variables_set", fields: { VAR: { id: varId(b.name) } }, inputs: { VALUE: { block: exprBlock(b.expr) } } };
      case "map":
        return {
          type: "variables_set",
          fields: { VAR: { id: varId(b.name) } },
          inputs: { VALUE: { block: { type: "io_map", inputs: { VALUE: { block: { type: "variables_get", fields: { VAR: { id: varId(b.src) } } } }, IN_LOW: { block: numBlock(b.inLow) }, IN_HIGH: { block: numBlock(b.inHigh) }, OUT_LOW: { block: numBlock(b.outLow) }, OUT_HIGH: { block: numBlock(b.outHigh) } } } } },
        };
      case "waitUntil":
        return { type: "io_wait_until", inputs: { COND: { block: cond(b.cond) } } };
      case "if": {
        const inputs: B = { IF0: { block: cond(b.cond) } };
        const then = stack(b.then);
        if (then) inputs.DO0 = then;
        const els = stack(b.else);
        if (els) inputs.ELSE = els;
        return { type: "controls_if", ...(els ? { extraState: { hasElse: true } } : {}), inputs };
      }
      case "repeat": {
        const body = stack(b.body);
        return { type: "controls_repeat_ext", inputs: { TIMES: { block: numBlock(b.times) }, ...(body ? { DO: body } : {}) } };
      }
    }
  };
  const top: B[] = [];
  const s = stack(program.setup);
  top.push({ type: "arduino_setup", x: 20, y: 20, ...(s ? { inputs: { DO: s } } : {}) });
  const l = stack(program.loop);
  top.push({ type: "arduino_loop", x: 20, y: 220, ...(l ? { inputs: { DO: l } } : {}) });
  return { blocks: { languageVersion: 0, blocks: top }, variables: Array.from(vars.entries()).map(([name, id]) => ({ name, id })) };
}

/** An empty program: the two hats, ready for blocks. */
export function emptyBlockly() {
  return programToBlockly({ setup: [], loop: [] });
}

