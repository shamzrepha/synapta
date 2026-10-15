import { CATALOG, type ComponentDef } from "../circuit/catalog";
import { PART_USAGE, type PartUsage } from "./usage";
import { VERIFIED_BY_TYPE, type VerifiedPart } from "./library";

/**
 * The Maker Space shop: every part a design can use, with its pinout, datasheet facts (when
 * verified), real dimensions, usage snippet and price. The shop is the single source for the UI
 * and for what the AI is allowed to build with.
 */
export type ShopCategory = "Boards" | "Motor drivers" | "Motors & actuators" | "Sensors" | "Power" | "Inputs" | "Lights & sound" | "Basics";

export interface ShopItem {
  type: string;
  name: string;
  category: ShopCategory;
  verified: boolean;
  summary: string;
  cost: string;
  pins: Array<{ name: string; role: string }>;
  usage: PartUsage;
  facts: VerifiedPart | null;
  learn?: string;
}

const CATEGORY: Record<string, ShopCategory> = {
  board: "Boards",
  l298n: "Motor drivers",
  tb6612: "Motor drivers",
  motor_driver: "Motor drivers",
  dc_motor: "Motors & actuators",
  servo: "Motors & actuators",
  hc_sr04: "Sensors",
  ir_sensor: "Sensors",
  light_sensor: "Sensors",
  temp_sensor: "Sensors",
  dht11: "Sensors",
  mpu6050: "Sensors",
  stepper: "Motors & actuators",
  relay: "Motor drivers",
  oled: "Lights & sound",
  potentiometer: "Sensors",
  battery: "Power",
  button: "Inputs",
  switch: "Inputs",
  led: "Lights & sound",
  buzzer: "Lights & sound",
  resistor: "Basics",
};

export const SHOP_CATEGORIES: ShopCategory[] = ["Boards", "Motor drivers", "Motors & actuators", "Sensors", "Power", "Inputs", "Lights & sound", "Basics"];

function toItem(c: ComponentDef): ShopItem {
  const facts = VERIFIED_BY_TYPE[c.type] || null;
  return {
    type: c.type,
    name: facts?.name || c.name,
    category: CATEGORY[c.type] || "Basics",
    verified: !!facts,
    summary: facts?.summary || c.description,
    cost: c.cost || "",
    pins: c.pins.map((p) => ({ name: p.name, role: p.role })),
    usage: PART_USAGE[c.type] || { wiring: [], mistakes: [] },
    facts,
    learn: c.learn,
  };
}

export function shopItems(): ShopItem[] {
  return CATALOG.map(toItem);
}

export function shopItem(type: string): ShopItem | undefined {
  const c = CATALOG.find((x) => x.type === type);
  return c ? toItem(c) : undefined;
}

/** Parts every design may use without selecting them (they teach nothing new and have no datasheet risk). */
export const ALWAYS_ALLOWED = ["board", "resistor", "led", "button", "switch"];

/** The one-line index the planner chooses from. */
export function shopIndex(): string {
  return shopItems()
    .map((i) => `- ${i.type} (${i.category}${i.verified ? ", datasheet-verified" : ""}): ${i.name}. Pins: ${i.pins.map((p) => p.name).join(", ")}.`)
    .join("\n");
}

/**
 * The snippet sent to the AI for the selected parts: pinout, datasheet facts and logic, wiring that is known
 * to work, working code, and classic mistakes. Keeps the model on real behaviour instead of invention.
 */
export function promptPack(types: string[]): string {
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const t of types) {
    if (seen.has(t)) continue;
    seen.add(t);
    const it = shopItem(t);
    if (!it) continue;
    const lines = [`### ${it.type} — ${it.name}${it.verified ? " [DATASHEET-VERIFIED]" : " [simplified model]"}`];
    lines.push(`Pins (wire ends are "${it.type === "board" ? "board" : "<id>"}.<pin>"): ${it.pins.map((p) => `${p.name}(${p.role})`).join(", ")}`);
    if (it.facts) {
      lines.push("Datasheet facts: " + it.facts.facts.filter((f) => !f.approx).map((f) => `${f.label}: ${f.value}`).join("; "));
      if (it.facts.logic) lines.push(`${it.facts.logic.title}: ` + it.facts.logic.rows.map((r) => r.join(" | ")).join(" ; "));
    } else lines.push(`About: ${it.summary}`);
    if (it.usage.wiring.length) lines.push("Wiring that works: " + it.usage.wiring.join(" "));
    if (it.usage.code) lines.push("Working code:\n" + it.usage.code);
    if (it.usage.mistakes.length) lines.push("Classic mistakes: " + it.usage.mistakes.join(" "));
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}
