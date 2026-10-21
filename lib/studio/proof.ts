import { CATALOG_BY_TYPE } from "./circuit/catalog";
import type { DesignSpec, Step } from "./spec";

/**
 * "Prove it": the learner rebuilds a lab from nothing. They start on an empty bench, pick every part from the shop
 * (the shopping cart), place and wire it, write the program, and the same engines that check any guided step
 * (part counts, wiring, code) confirm it. The teacher's reference design is never copied into the learner's design.
 *
 * Only circuit labs can be rebuilt this way. Mechanisms and 3D assemblies have no machine-checkable "built correctly"
 * rules yet, so they stay in Build & test.
 */
export const EMPTY_SKETCH = "void setup() {\n}\n\nvoid loop() {\n}\n";

export interface ShoppingItem {
  type: string;
  name: string;
  count: number;
}

/** What the reference build is made of, grouped by part type (the board is always provided). */
export function shoppingList(reference: DesignSpec): ShoppingItem[] {
  const counts = new Map<string, number>();
  for (const p of reference.circuit?.parts || []) {
    if (p.type === "board") continue;
    counts.set(p.type, (counts.get(p.type) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([type, count]) => ({ type, name: CATALOG_BY_TYPE[type]?.name || type, count }));
}

export function canProve(reference: DesignSpec): boolean {
  return reference.kind === "circuit" && !!reference.circuit && shoppingList(reference).length > 0;
}

/** The empty-bench design a learner starts from, or null when this lab can't be rebuilt. */
export function proofSpec(reference: DesignSpec): DesignSpec | null {
  if (!canProve(reference)) return null;
  const list = shoppingList(reference);
  const board = (reference.circuit?.parts || []).find((p) => p.type === "board");
  const steps: Step[] = [
    ...list.map<Step>((item) => ({
      id: `buy_${item.type}`,
      title: `Add ${item.count} × ${item.name}`,
      detail: `Open the parts shop, add ${item.count === 1 ? "one" : item.count} ${item.name}${item.count === 1 ? "" : "s"} to your cart and place ${item.count === 1 ? "it" : "them"} on the bench.`,
      check: { kind: "parts", type: item.type, min: item.count },
    })),
    {
      id: "wire_it",
      title: "Wire it all up",
      detail: "Connect every part to the board with wires. Check polarity, and give anything that needs one a resistor. The checker tells you what is still unconnected.",
      // placing the parts is not enough: all of them must be there AND wired with no errors
      check: { kind: "built", needs: list.map((i) => ({ type: i.type, min: i.count })) },
    },
    {
      id: "program_it",
      title: "Program it",
      detail: "Write the program with blocks or code: set each pin up in setup(), then drive it in loop().",
      check: { kind: "code" },
    },
    {
      id: "run_it",
      title: "Run it and compare",
      detail: `Press Run and check that it does what the lab asks: ${reference.summary || "the same job as the lab"}`,
      check: { kind: "manual" },
    },
  ];
  return {
    ...reference,
    summary: `Rebuild this yourself from an empty bench. ${reference.summary || ""}`.trim().slice(0, 800),
    // everything the learner must make is removed; the 3D view is generated from what they place
    parts: [],
    circuit: { parts: board ? [board] : [], wires: [] },
    code: EMPTY_SKETCH,
    blocks: undefined,
    blockly: undefined,
    codeMode: "blocks",
    mechanism: undefined,
    joints: [],
    triggers: [],
    robot: undefined,
    world: undefined,
    tests: [],
    steps,
  };
}
