import { CATALOG_BY_TYPE } from "./circuit/catalog";
import { VERIFIED_BY_TYPE } from "./parts/library";
import { PART_USAGE } from "./parts/usage";
import { bomFor, formatNaira, type Bom } from "./bom";
import type { DesignSpec } from "./spec";

/** Everything the printable build guide, the Markdown readme and the Maker Wall need, as plain data. */

export interface WireRow {
  n: number;
  from: string;
  to: string;
  color: string;
  sentence: string;
}

export interface PartWarning {
  type: string;
  name: string;
  warnings: string[];
}

export interface BuildGuide {
  title: string;
  summary: string;
  bom: Bom;
  wires: WireRow[];
  code: string;
  warnings: PartWarning[];
  safety: string[];
  steps: string[];
}

/** "led1.anode" → "LED “led1”, anode pin" in words a builder can follow. */
export function describePin(spec: Pick<DesignSpec, "circuit">, ref: string): string {
  const dot = ref.indexOf(".");
  const id = dot < 0 ? ref : ref.slice(0, dot);
  const pin = dot < 0 ? "" : ref.slice(dot + 1);
  const part = spec.circuit?.parts.find((p) => p.id === id);
  const def = part ? CATALOG_BY_TYPE[part.type] : undefined;
  if (!part || !def) return ref;
  if (part.type === "board") return `the board's ${pin} pin`;
  const label = part.label && part.label !== part.id ? `${part.label} (${part.id})` : part.id;
  return `${def.name.replace(/ \(.*\)$/, "")} “${label}”, ${pin} pin`;
}

export function wireRows(spec: Pick<DesignSpec, "circuit">): WireRow[] {
  return (spec.circuit?.wires || []).map((w, i) => {
    const from = describePin(spec, w.from);
    const to = describePin(spec, w.to);
    const color = w.color || "any colour";
    return { n: i + 1, from, to, color, sentence: `Connect ${from} to ${to}.` };
  });
}

const BASE_SAFETY = [
  "Unplug the battery and the USB cable before you change any wire.",
  "Check every wire against the table before you switch the power on.",
  "Check the battery's plus and minus twice: reversed power can destroy a board or a driver.",
  "Never connect a motor or servo directly to a board pin — use the driver or the 5 V rail as shown.",
  "Put a resistor in series with every LED.",
  "Keep metal tools and loose wire ends away from the battery terminals.",
];

/** Datasheet warnings (library) and classic mistakes (usage) for every part type in the design. */
export function partWarnings(spec: Pick<DesignSpec, "circuit">): PartWarning[] {
  const types = Array.from(new Set((spec.circuit?.parts || []).map((p) => p.type)));
  const out: PartWarning[] = [];
  for (const t of types) {
    const list = [...(VERIFIED_BY_TYPE[t]?.warnings || []), ...(PART_USAGE[t]?.mistakes || [])];
    const uniq = Array.from(new Set(list));
    if (uniq.length) out.push({ type: t, name: VERIFIED_BY_TYPE[t]?.name || CATALOG_BY_TYPE[t]?.name || t, warnings: uniq });
  }
  return out;
}

export function safetyChecklist(spec: Pick<DesignSpec, "circuit">): string[] {
  const types = new Set((spec.circuit?.parts || []).map((p) => p.type));
  const extra: string[] = [];
  if (types.has("battery") || types.has("l298n") || types.has("tb6612")) extra.push("Join the battery's minus to the board's GND (shared ground), or the motors will not obey the code.");
  if (types.has("dc_motor") || types.has("servo")) extra.push("Fix moving parts down before the first power-on and keep fingers clear of gears and wheels.");
  if (types.has("l298n")) extra.push("The L298N gets hot: do not touch its heat sink after a long run.");
  return [...BASE_SAFETY, ...extra];
}

export function buildGuide(title: string, spec: DesignSpec): BuildGuide {
  return {
    title,
    summary: spec.summary || "",
    bom: bomFor(spec),
    wires: wireRows(spec),
    code: spec.code || "",
    warnings: partWarnings(spec),
    safety: safetyChecklist(spec),
    steps: spec.steps.map((s) => s.title),
  };
}

/** A Markdown readme for the design (README.md export). */
export function readmeMarkdown(title: string, spec: DesignSpec, opts: { author?: string; url?: string } = {}): string {
  const g = buildGuide(title, spec);
  const L: string[] = [`# ${title}`, ""];
  if (opts.author) L.push(`By ${opts.author}${opts.url ? ` · ${opts.url}` : ""}`, "");
  if (g.summary) L.push(g.summary, "");
  if (g.bom.lines.length) {
    L.push("## Parts list", "", "| Qty | Part | Unit | Subtotal |", "| --- | --- | ---: | ---: |");
    for (const l of g.bom.lines) L.push(`| ${l.qty} | ${l.name} | ${formatNaira(l.unit)} | ${formatNaira(l.subtotal)} |`);
    L.push(`| | **Total** | | **${formatNaira(g.bom.total)}** |`, "");
  }
  if (g.wires.length) {
    L.push("## Wiring", "", "| # | From | To | Wire |", "| ---: | --- | --- | --- |");
    for (const w of g.wires) L.push(`| ${w.n} | ${w.from} | ${w.to} | ${w.color} |`);
    L.push("");
  }
  if (g.code.trim()) L.push("## Code", "", "```cpp", g.code.trimEnd(), "```", "");
  if (g.steps.length) {
    L.push("## Build steps", "");
    g.steps.forEach((s, i) => L.push(`${i + 1}. ${s}`));
    L.push("");
  }
  if (g.warnings.length) {
    L.push("## Watch out", "");
    for (const w of g.warnings) for (const t of w.warnings) L.push(`- **${w.name}:** ${t}`);
    L.push("");
  }
  L.push("## Safety", "");
  for (const s of g.safety) L.push(`- [ ] ${s}`);
  L.push("", "_Made with SunRoot Maker Studio._", "");
  return L.join("\n");
}

/** A safe file name for downloads. */
export function fileSlug(title: string, fallback = "design"): string {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return s || fallback;
}
