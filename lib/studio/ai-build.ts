import { z } from "zod";
import { generateWithFallback } from "@/lib/ai/router";
import { CATALOG_BY_TYPE } from "./circuit/catalog";
import { checkCircuit } from "./circuit/checker";
import { runAllTests } from "./verify";
import { libraryDigest } from "./parts/library";
import { ALWAYS_ALLOWED, promptPack, shopIndex, shopItem } from "./parts/shop";
import { TEMPLATES } from "./templates";
import type { DesignSpec } from "./spec";

/**
 * Keeps the AI honest. Instead of asking a model to remember how components work, every request
 * carries a "grounding pack": the datasheet facts, pinouts, wiring and working code for exactly the
 * parts being used, a proven example design that uses similar parts, and the rule that nothing outside
 * the shop may appear. Afterwards the simulator checks the result (wiring, behaviour tests) and the
 * model gets one chance to fix what the checks found.
 */

export interface PartSelection {
  type: string;
  qty: number;
}

export const selectionSchema = z.array(z.object({ type: z.string().max(30), qty: z.number().int().min(1).max(12).default(1) })).max(24);

/** Keeps only shop parts, merges duplicates, clamps quantities. */
export function cleanSelection(input: Array<{ type: string; qty?: number }> | undefined): PartSelection[] {
  const map = new Map<string, number>();
  for (const s of input || []) {
    if (!shopItem(s.type)) continue;
    map.set(s.type, Math.min(12, (map.get(s.type) || 0) + Math.max(1, Math.round(s.qty || 1))));
  }
  return Array.from(map, ([type, qty]) => ({ type, qty }));
}

// ---------------------------------------------------------------- planning (the bill of materials)

export const planSchema = z.object({
  title: z.string().max(80).default("My build"),
  summary: z.string().max(500).default(""),
  /** how to accomplish it, in the order a maker would do it */
  approach: z.array(z.string().max(300)).max(10).default([]),
  parts: z.array(z.object({ type: z.string().max(30), qty: z.number().int().min(1).max(12).default(1), why: z.string().max(240).default("") })).max(20),
  /** things the idea needs that the shop doesn't sell yet */
  notInShop: z.array(z.string().max(160)).max(8).default([]),
  warnings: z.array(z.string().max(240)).max(6).default([]),
});

export type Plan = z.output<typeof planSchema>;

const PLAN_SYSTEM = `You are the buyer-engineer at Sunroot's Maker Space shop. A learner describes something they want to build. You choose the parts from THE SHOP below and explain why each is needed — like a bill of materials a real engineer would sign off.
RULES
- Use ONLY part types from THE SHOP. Never invent a part or a part number. If the idea needs something the shop doesn't have, list it in "notInShop" and design around it.
- Prefer parts marked datasheet-verified. Do not choose the simplified "motor_driver" when l298n or tb6612 exists.
- Electrical sense, using the datasheet facts: motors need a driver and a battery (never a board pin); the battery minus shares ground with the board; the L298N wastes 2–3 V (so a 6 V pack gives ~3.5 V) while the TB6612FNG wastes ~0.15 V; an HC-SR04 needs 5 V; a servo needs 5 V.
- Quantities are realistic (a two-wheel robot has 2 motors; a line follower usually 2–3 line sensors).
- "approach" is 4–8 short steps: how to build it, in order (mechanics → wiring → code → test → tune).
- Always include one board.
Return ONLY JSON: {"title":"…","summary":"one paragraph","approach":["…"],"parts":[{"type":"l298n","qty":1,"why":"…"}],"notInShop":["…"],"warnings":["…"]}.

THE SHOP
${shopIndex()}

DATASHEET-VERIFIED FACTS
${libraryDigest()}`;

export async function planProject(params: { prompt: string; level?: string; userId: string }): Promise<Plan> {
  const res = await generateWithFallback({
    task: "studio_build",
    systemInstruction: PLAN_SYSTEM,
    userPrompt: `Idea: ${params.prompt.slice(0, 1500)}\nLearner level: ${params.level || "beginner"}. Choose the parts.`,
    schema: planSchema,
    temperature: 0.3,
    userId: params.userId,
  });
  const plan = res.data!;
  const parts: Plan["parts"] = [];
  for (const p of plan.parts) {
    if (!CATALOG_BY_TYPE[p.type]) continue; // never a part the shop doesn't have
    const at = parts.find((x) => x.type === p.type);
    if (at) at.qty = Math.min(12, at.qty + p.qty);
    else parts.push(p);
  }
  if (!parts.some((p) => p.type === "board")) parts.unshift({ type: "board", qty: 1, why: "Runs your code and switches everything." });
  const types = new Set(parts.map((p) => p.type));
  const warnings = [...plan.warnings];
  if ((types.has("l298n") || types.has("tb6612")) && !types.has("battery")) {
    parts.push({ type: "battery", qty: 1, why: "Motor drivers need their own battery supply (a board pin can't power motors)." });
    warnings.push("Added a battery: motor drivers take their power from a battery, not from the board.");
  }
  if ((types.has("l298n") || types.has("tb6612")) && !types.has("dc_motor") && !plan.notInShop.length) {
    parts.push({ type: "dc_motor", qty: 2, why: "Something for the driver to drive." });
  }
  return { ...plan, parts, warnings };
}

// ---------------------------------------------------------------- research (how to accomplish it, with sources)

export interface Research {
  notes: string;
  sources: Array<{ title: string; uri: string }>;
}

/** Best-effort web research with Google Search grounding; never blocks a build. */
export async function researchProject(params: { prompt: string; parts: PartSelection[]; userId: string }): Promise<Research | null> {
  try {
    const list = params.parts.map((p) => `${p.qty} × ${shopItem(p.type)?.name || p.type}`).join(", ");
    const res = await generateWithFallback({
      task: "research_answer",
      systemInstruction:
        "You are a robotics and electronics mentor doing quick pre-build research. Use web search. Report ONLY facts you found: how makers actually build this kind of project, typical mechanical dimensions, wiring pitfalls, control strategies that work, and tuning tips. Short bullets (max 12), no padding, no invented part numbers. Plain text.",
      userPrompt: `Project: ${params.prompt.slice(0, 800)}\nParts chosen: ${list}\nGive the best-practice approach to build and code this reliably.`,
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
      userId: params.userId,
    });
    const notes = res.text.trim().slice(0, 4000);
    if (!notes) return null;
    return { notes, sources: res.sources || [] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- grounding pack for a build

function typesOf(spec: Pick<DesignSpec, "circuit"> | undefined): string[] {
  return Array.from(new Set((spec?.circuit?.parts || []).map((p) => p.type)));
}

/** The proven template that shares the most part types with the selection, trimmed for the prompt. */
export function pickExample(types: string[]): { id: string; title: string; json: string } | null {
  let best: { score: number; t: (typeof TEMPLATES)[number] } | null = null;
  for (const t of TEMPLATES) {
    const have = typesOf(t.spec as DesignSpec);
    if (!have.length) continue;
    const overlap = have.filter((x) => types.includes(x) && !ALWAYS_ALLOWED.includes(x)).length;
    const score = overlap * 3 - have.filter((x) => !types.includes(x) && !ALWAYS_ALLOWED.includes(x)).length;
    if (overlap > 0 && (!best || score > best.score)) best = { score, t };
  }
  if (!best) return null;
  const { steps, notes, tests, ...core } = best.t.spec as Record<string, unknown>;
  void notes;
  let json = JSON.stringify({ ...core, steps: Array.isArray(steps) ? (steps as unknown[]).slice(0, 2) : undefined, tests: Array.isArray(tests) ? (tests as unknown[]).slice(0, 1) : undefined });
  if (json.length > 9000) json = JSON.stringify(core).slice(0, 9000);
  return { id: best.t.id, title: best.t.title, json };
}

/**
 * The snippet attached to every build request. `types` are the parts the learner selected (empty = the
 * AI may choose from the shop, but still gets the verified facts for everything).
 */
export function groundingBlock(params: { types: string[]; research?: Research | null }): string {
  const parts: string[] = [];
  if (params.types.length) {
    parts.push(`PARTS YOU MAY USE (the learner selected exactly these; nothing else, apart from board/resistor/led/button/switch):\n${promptPack(params.types)}`);
    const ex = pickExample(params.types);
    if (ex) parts.push(`PROVEN EXAMPLE — "${ex.title}" (a design the Studio already verified; copy its wiring and structure, adapt it to the request, do not copy blindly):\n${ex.json}`);
  } else {
    parts.push(`DATASHEET-VERIFIED PARTS (use these types and respect these facts; do not invent how a component works):\n${libraryDigest()}`);
  }
  if (params.research?.notes) parts.push(`RESEARCH NOTES (from the web; treat as hints, the datasheet facts above win):\n${params.research.notes}`);
  parts.push(`GROUNDING RULES
- A component behaves ONLY as its datasheet facts and logic table say. If you are unsure how something works, choose the simplest wiring from "Wiring that works" and say so in the step text — never guess pin names.
- Every circuit part "type" must be one of the types above. Wire ends are "partId.pin" with pins exactly as listed.
- Motors always go through a driver, powered from a battery whose minus is joined to the board GND.
- Work the numbers (volts, amps, rpm, timing) from the datasheet facts and show the calculation in the relevant step.
- SELF-CHECK before answering: (1) every wire pin exists; (2) every powered pin has a supply; (3) common ground; (4) the code only uses pins that are wired; (5) the tests you wrote pass for the code you wrote.`);
  return parts.join("\n\n");
}

/** Removes circuit parts (and their wires) that aren't in the selection. */
export function enforceParts(raw: Record<string, unknown>, selected: string[]): { spec: Record<string, unknown>; removed: string[] } {
  const allowed = new Set([...selected, ...ALWAYS_ALLOWED]);
  const circuit = raw.circuit as { parts?: Array<{ id: string; type: string }>; wires?: Array<{ from: string; to: string }> } | undefined;
  if (!circuit || !Array.isArray(circuit.parts)) return { spec: raw, removed: [] };
  const removed = circuit.parts.filter((p) => !allowed.has(p.type));
  if (!removed.length) return { spec: raw, removed: [] };
  const gone = new Set(removed.map((p) => p.id));
  const wires = (circuit.wires || []).filter((w) => !gone.has(String(w.from).split(".")[0]) && !gone.has(String(w.to).split(".")[0]));
  return { spec: { ...raw, circuit: { ...circuit, parts: circuit.parts.filter((p) => !gone.has(p.id)), wires } }, removed: removed.map((p) => `${p.id} (${p.type})`) };
}

/** Problems the simulator found in a design: wiring errors and failing behaviour tests. */
export function verifyProblems(spec: DesignSpec): string[] {
  const out: string[] = [];
  if (spec.circuit) {
    for (const i of checkCircuit(spec.circuit, spec.code || "")) if (i.severity === "error") out.push(`${i.system}: ${i.message}`);
    for (const r of runAllTests(spec)) if (!r.pass) out.push(`TEST FAILED “${r.title}”: ${r.message}`);
  }
  return out.slice(0, 10);
}

// ---------------------------------------------------------------- lab ideas for a class topic

export const ideasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().max(80),
        /** one or two sentences on what they will build and what it teaches about the topic */
        pitch: z.string().max(300),
        kind: z.enum(["circuit", "mechanism", "assembly"]).default("circuit"),
        level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
        /** what goes into the Maker Studio planner to start this build */
        buildPrompt: z.string().max(300),
        /** the shop parts it needs, for the preview */
        parts: z.array(z.string().max(30)).max(8).default([]),
      })
    )
    .max(8),
});
export type LabIdeas = z.output<typeof ideasSchema>;

const IDEAS_SYSTEM = `You suggest small hands-on builds a student can make and test in Sunroot's Maker Studio simulator (circuits with code, gear mechanisms, or 3D assemblies) that teach ONE class topic.
RULES
- Every idea must clearly teach the topic, be doable in 15–45 minutes, and work with ONLY parts from THE SHOP.
- Give a spread: one easy first build, one that uses a knob or sensor (analogRead), one that needs a decision (if/else) or motion.
- "buildPrompt" is a plain instruction a beginner could type, e.g. "a night light that turns on when the room gets dark, using a light sensor and an LED".
- "parts" are shop part types only.
Return ONLY JSON: {"ideas":[{"title":"…","pitch":"…","kind":"circuit","level":"beginner","buildPrompt":"…","parts":["led","resistor"]}]}.

THE SHOP
${shopIndex()}`;

export async function suggestLabIdeas(params: { topic: string; description?: string; level?: string; userId: string }): Promise<LabIdeas["ideas"]> {
  const res = await generateWithFallback({
    task: "studio_build",
    systemInstruction: IDEAS_SYSTEM,
    userPrompt: `Class topic: ${params.topic.slice(0, 120)}\n${params.description ? `About it: ${params.description.slice(0, 400)}\n` : ""}Learner level: ${params.level || "beginner"}. Suggest 4 builds.`,
    schema: ideasSchema,
    temperature: 0.6,
    userId: params.userId,
  });
  return res.data!.ideas
    .map((i) => ({ ...i, parts: i.parts.filter((t) => !!CATALOG_BY_TYPE[t]) }))
    .filter((i) => i.title.trim() && i.buildPrompt.trim().length >= 4)
    .slice(0, 5);
}
