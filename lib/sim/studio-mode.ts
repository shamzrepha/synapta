import { z } from "zod";
import { executeStructuredAiTask } from "@/lib/ai/router";
import { normalizeQuizQuestions, type NormalizedQuizQuestion } from "@/lib/quiz/normalize";
import { readableText } from "@/lib/text/readable";
import { generateDesign } from "@/lib/studio/design-ai";
import type { DesignKind, DesignSpec } from "@/lib/studio/spec";

export type SimulationMedium = "studio" | "html";

export interface SimulationMediumDecision {
  medium: SimulationMedium;
  kind: DesignKind | null;
  confident: boolean;
  reason: string;
}

export interface StudioSimulationPayload {
  studioSpec: DesignSpec;
  title: string;
  goal: string;
  howTo: string[];
  concepts: string[];
  checkQuestion: NormalizedQuizQuestion | null;
}

const STRONG_STUDIO_CIRCUIT_RE =
  /\b(arduino|starter\s*board|esp32|microcontroller|gpio|pwm|digitalwrite|digitalread|analogread|analogwrite|serial\.print|blockly|scratch\s*blocks|tinkercad|breadboard|jumper\s*wire|hc[-\s]?sr04|ultrasonic\s*sensor|dht11|ir\s*sensor|l298n|tb6612|stepper\s*motor|servo\s*motor|potentiometer|photoresistor|ldr\b|oled\s*display|neopixel|line[-\s]?follow(?:er|ing)\s*robot|obstacle[-\s]?avoid(?:ing|ance)\s*robot|autonomous\s*robot|ohm'?s?\s*law|ohms?\s*law|kirchhoff'?s?\s*(?:current|voltage|law|laws)|series\s*(?:and|or|&|vs\.?)\s*parallel\s*circuits?|voltage\s*divider|dc\s*circuit|electric(?:al)?\s*circuit\s*(?:lab|bench|simulator|wiring)|ammeter\s*(?:and|&)\s*voltmeter|light\s*bulb\s*circuit|resistor\s*network|relay\s*circuit|buzzer\s*circuit|rgb\s*led)\b/i;

const STRONG_STUDIO_MECH_RE =
  /\b(gear\s*trains?|gear\s*ratios?|spur\s*gears?|bevel\s*gears?|worm\s*gears?|rack\s*and\s*pinion|mechanical\s*advantage\s*of\s*(?:gears|pulleys|levers)|pulley\s*systems?|winch\s*mechanism|crane\s*boom)\b/i;

const MAYBE_STUDIO_RE =
  /\b(resistor|led\b|push\s*button|switch|capacitor|diode|relay|solenoid|dc\s*motor|multimeter|voltmeter|ammeter|ohmmeter|circuit|wiring|gear|pulley|lever|linkage|robotics?|sensor|actuator|servo|buzzer)\b/i;

const HARDWARE_TERMS_RE =
  /\b(arduino|starter\s*board|circuit|resistor|wire|wiring|blockly|robot|gear\s*train|potentiometer|servo|breadboard|ultrasonic)\b/i;

const EXPLICIT_HTML_OPT_OUT_RE =
  /\b(html5?|canvas\s*game|2d\s*graph\s*only|plot\s*only|chart\s*only|no\s*circuit|without\s*(?:circuit|arduino|wiring|blockly|3d))\b/i;

const BIO_METAPHOR_RE =
  /\b(neural\s*circuit|brain\s*circuit|memory\s*circuit|anatomy|nervous\s*system|neuron|synapse|physiology|cell\s*biology|genetics|ecosystem)\b/i;

const NON_HARDWARE_SUBJECT_RE =
  /\b(biology|chemistry|organic\s*chemistry|biochemistry|literature|history|geography|economics|finance|accounting|language|french|spanish|english|calculus|statistics|algebra|geometry)\b/i;

/**
 * Fast heuristic pre-classifier deciding whether a classroom topic/prompt belongs in the
 * interactive SunRoot Studio workbench (circuit bench + Blockly/C++ + 3D/mechanisms) vs HTML5 canvas.
 */
export function classifySimulationMediumHeuristic(input: {
  kcTitle: string;
  subject?: string;
  contextText?: string;
  objective?: string;
  instructions?: string;
}): SimulationMediumDecision {
  const instr = (input.instructions || "").trim();
  const focus = [input.kcTitle, input.objective || "", instr].filter(Boolean).join("\n");
  const full = `${focus}\n${input.subject || ""}`;

  if (instr && EXPLICIT_HTML_OPT_OUT_RE.test(instr) && !HARDWARE_TERMS_RE.test(instr.replace(new RegExp(EXPLICIT_HTML_OPT_OUT_RE.source, "gi"), ""))) {
    return { medium: "html", kind: null, confident: true, reason: "Teacher instructions requested an HTML/2D canvas format" };
  }

  // Avoid misrouting biological "neural circuits" to the electronics workbench unless hardware terms appear.
  const looksBiological = BIO_METAPHOR_RE.test(full) && !/\b(arduino|resistor|breadboard|ohm|voltage|blockly|voltmeter)\b/i.test(focus);
  if (looksBiological) {
    return { medium: "html", kind: null, confident: true, reason: "Biological context uses custom 2D/HTML simulation" };
  }

  if (STRONG_STUDIO_CIRCUIT_RE.test(focus)) {
    return { medium: "studio", kind: "circuit", confident: true, reason: "Topic involves circuits, wiring, electronics, microcontrollers, Blockly coding, or robotics" };
  }

  if (STRONG_STUDIO_MECH_RE.test(focus)) {
    return { medium: "studio", kind: "mechanism", confident: true, reason: "Topic involves gears or mechanical drive trains" };
  }

  if (MAYBE_STUDIO_RE.test(focus)) {
    const kind: DesignKind = /\b(gear|pulley|lever|linkage)\b/i.test(focus) && !/\b(led|resistor|circuit|sensor|motor|arduino)\b/i.test(focus) ? "mechanism" : "circuit";
    return { medium: "studio", kind, confident: false, reason: "Contains engineering/electronics terms; confirm best format" };
  }

  if (input.subject && NON_HARDWARE_SUBJECT_RE.test(input.subject) && !MAYBE_STUDIO_RE.test(instr)) {
    return { medium: "html", kind: null, confident: true, reason: "Non-hardware subject best served by bespoke HTML5 simulation" };
  }

  return { medium: "html", kind: null, confident: false, reason: "No obvious hardware trigger; consult AI classifier" };
}

const mediumDecisionSchema = z.object({
  medium: z.enum(["studio", "html"]),
  kind: z.enum(["circuit", "mechanism", "assembly"]).nullable().optional(),
  reason: z.string().default(""),
});

/**
 * Picks whether a newly built classroom simulation/piece lab should run on the interactive
 * SunRoot Studio workbench (CircuitBench + Hardware-Synced Blockly/C++ + 3D Stage) or a bespoke HTML5 page.
 */
export async function decideSimulationMedium(params: {
  kcTitle: string;
  subject: string;
  level: string;
  contextText: string;
  objective?: string;
  instructions?: string;
  userId: string;
}): Promise<SimulationMediumDecision> {
  const heuristic = classifySimulationMediumHeuristic(params);
  if (heuristic.confident) return heuristic;

  try {
    const res = await executeStructuredAiTask({
      learnerLanguage: false,
      task: "structured_spec",
      systemInstruction: `Decide whether an interactive learning lab for this topic should use SunRoot Studio ("studio") or a custom HTML5 canvas simulation ("html").

Choose "studio" ONLY when the lab truly centers on one of SunRoot Studio's interactive engines:
1. "circuit": Electrical / DC circuits (Ohm's law, series/parallel resistors/bulbs, batteries, switches, multimeters), digital electronics / sensors / actuators (LEDs, relays, servos, stepper motors, ultrasonic HC-SR04, DHT11, LDR, IR), Arduino / Starter board programming with Scratch-style Blockly blocks or C++, OR wheeled robotics (line followers, obstacle-avoiding robots).
2. "mechanism": 3D gear trains, rack & pinion, bevel/worm gears, belt/pulley drives, winches, cranes, levers.
3. "assembly": 3D CAD engineering structures or physical enclosures where interactive 3D exploded assembly teaches the topic best.

Choose "html" for ALL other topics (kinematics/projectiles, optics/lenses/waves, chemistry/titration/pH, biology/anatomy/ecosystems, economics, mathematics/graphing, computing algorithms without Arduino/circuit hardware, or when custom 2D plots/games are clearer).

Return JSON: {"medium":"studio"|"html","kind":"circuit"|"mechanism"|"assembly"|null,"reason":"short reason"}.`,
      userPrompt: [
        `Subtopic: ${params.kcTitle}`,
        params.objective ? `Specific piece objective: ${params.objective}` : "",
        `Subject: ${params.subject} · Level: ${params.level}`,
        params.instructions ? `Teacher instructions: ${params.instructions}` : "",
        `Material summary: ${params.contextText.slice(0, 1200)}`,
      ]
        .filter(Boolean)
        .join("\n"),
      schema: mediumDecisionSchema,
      userId: params.userId,
      estimatedTokens: 600,
      isPrivileged: true,
    });
    const out = res.data!;
    return {
      medium: out.medium,
      kind: out.medium === "studio" ? out.kind || heuristic.kind || "circuit" : null,
      confident: true,
      reason: out.reason || heuristic.reason,
    };
  } catch {
    return { ...heuristic, confident: true };
  }
}

const studioMetaSchema = z.object({
  title: z.string().min(2).max(140),
  goal: z.string().min(5).max(500),
  howTo: z.array(z.string()).min(1).max(6),
  concepts: z.array(z.string()).min(1).max(8),
  checkQuestion: z.object({
    question: z.string().min(5),
    options: z.array(z.union([z.string(), z.number()]).transform(String)).min(4).max(4),
    answer: z.union([z.string(), z.number()]).transform(String),
    explanation: z.string().default(""),
  }),
});

function summarizeSpecForMeta(spec: DesignSpec): string {
  const parts = spec.circuit?.parts.map((p) => `${p.id} (${p.type})`).join(", ") || "none";
  const wires = spec.circuit?.wires.map((w) => `${w.from} -> ${w.to}`).slice(0, 18).join("; ") || "none";
  const tests =
    spec.tests
      .map((t) => {
        const exp = t.expect;
        if (exp.kind === "at") return `${t.title}: ${exp.checks.map((c) => `${c.part}=${c.on ? "on" : "off"}@${c.atMs}ms`).join(", ")}`;
        return `${t.title}: sequence(${exp.parts.join(", ")})`;
      })
      .join(" | ") || "none";
  const mech = spec.mechanism ? `Mechanism rig (${spec.mechanism.stages.length} gear stage(s))` : "none";
  const steps = spec.steps.map((s) => s.title).join(" -> ") || "explore";
  return [
    `Kind: ${spec.kind}`,
    `Summary: ${spec.summary}`,
    `Circuit parts: ${parts}`,
    `Circuit wires: ${wires}`,
    `Mechanism: ${mech}`,
    `Code mode: ${spec.codeMode || (spec.code ? "text" : "none")}`,
    `Behavior tests: ${tests}`,
    `Steps: ${steps}`,
  ].join("\n");
}

/**
 * Generates classroom goal, howTo instructions, concepts, and a graded 4-option checkQuestion
 * grounded in an interactive SunRoot Studio DesignSpec.
 */
export async function generateStudioCheckMeta(params: {
  kcTitle: string;
  subject: string;
  level: string;
  objective?: string;
  spec: DesignSpec;
  title: string;
  userId: string;
}): Promise<Omit<StudioSimulationPayload, "studioSpec">> {
  const fallbackHowTo =
    params.spec.steps.length > 0
      ? params.spec.steps.slice(0, 4).map((s) => readableText(s.title))
      : ["Inspect or adjust the parts on the interactive bench.", "Switch to Code/Blocks if programmable, then press Run.", "Press interactive switches/buttons or adjust sliders and observe the output."];
  const fallback: Omit<StudioSimulationPayload, "studioSpec"> = {
    title: readableText(params.title) || `${params.kcTitle} — Interactive Lab`,
    goal: readableText(params.spec.summary) || "Build, run, and test the interactive lab to see how each part behaves.",
    howTo: fallbackHowTo,
    concepts: [readableText(params.kcTitle)],
    checkQuestion: null,
  };

  try {
    const res = await executeStructuredAiTask({
      learnerLanguage: false,
      task: "structured_spec",
      systemInstruction: `Write concise classroom metadata and ONE 4-option checkQuestion for a student who just experimented with this interactive SunRoot Studio lab.
- "goal": one sentence describing what the learner discovers/verifies in this lab.
- "howTo": 3–4 short, clear action steps using the interactive bench / Blockly blocks / controls / Run button.
- "concepts": 2–5 short key terms taught.
- "checkQuestion": 1 multiple-choice question with EXACTLY 4 distinct plausible options and "answer" matching the exact text of the correct option, plus a 1-sentence "explanation". The question must test insight gained by running/modifying this exact lab (not trivial definitions).`,
      userPrompt: `Topic: ${params.kcTitle}\n${params.objective ? `Objective: ${params.objective}\n` : ""}Subject: ${params.subject} · Level: ${params.level}\nLab title: ${params.title}\n${summarizeSpecForMeta(params.spec)}`,
      schema: studioMetaSchema,
      userId: params.userId,
      estimatedTokens: 1200,
      isPrivileged: true,
    });
    const m = res.data!;
    const [q] = normalizeQuizQuestions([{ ...m.checkQuestion, difficulty: "medium" }]);
    const checkQuestion = q
      ? { ...q, question: readableText(q.question), options: q.options.map((o) => readableText(o)), explanation: readableText(q.explanation) }
      : null;
    return {
      title: readableText(m.title) || fallback.title,
      goal: readableText(m.goal) || fallback.goal,
      howTo: m.howTo.map((h) => readableText(h)).filter(Boolean),
      concepts: m.concepts.map((c) => readableText(c)).filter(Boolean),
      checkQuestion,
    };
  } catch {
    return fallback;
  }
}

/**
 * Generates a full Classroom Studio Lab payload (`DesignSpec` + classroom check metadata) using
 * Maker Studio's `generateDesign` validator & simulator verifier.
 */
export async function generateStudioSimulation(params: {
  kcTitle: string;
  subject: string;
  level: string;
  contextText: string;
  objectives?: string[];
  objective?: string;
  instructions?: string;
  kind?: DesignKind | null;
  userId: string;
}): Promise<StudioSimulationPayload> {
  const promptParts = [
    `Interactive Classroom Lab for subtopic: ${params.kcTitle}`,
    params.objective ? `Focused learning objective: ${params.objective}` : "",
    `Subject: ${params.subject} · Level: ${params.level}`,
    params.objectives?.length && !params.objective ? `Learning objectives:\n- ${params.objectives.slice(0, 5).join("\n- ")}` : "",
    params.instructions ? `Teacher instructions:\n${params.instructions}` : "",
    `Grounded lesson material:\n${params.contextText.slice(0, 2200)}`,
    "Design an authentic hands-on lab on SunRoot Maker Studio: Pure DC electronics topics (Ohm's law, series/parallel bulbs, battery + resistor + switch + meters) must NOT include a programmable board or code tab; programmable sensor/actuator/robotics labs must include a Starter board with Scratch-style Blockly blocks (codeMode: \"blocks\") that match wired pins and 3D moving parts where appropriate.",
  ].filter(Boolean);

  const built = await generateDesign({
    prompt: promptParts.join("\n\n"),
    kind: params.kind ?? undefined,
    level: params.level,
    userId: params.userId,
  });

  // Normalize interactive studio spec defaults: board labs with block programs open in Blocks mode so
  // students see the hardware-synced Scratch drawer and can switch to Raw code anytime.
  const hasBoard = !!built.spec.circuit?.parts.some((p) => p.type === "board");
  const studioSpec: DesignSpec =
    hasBoard && !built.spec.codeMode && (built.spec.blocks || built.spec.blockly)
      ? { ...built.spec, codeMode: "blocks" }
      : built.spec;

  const meta = await generateStudioCheckMeta({
    kcTitle: params.kcTitle,
    subject: params.subject,
    level: params.level,
    objective: params.objective,
    spec: studioSpec,
    title: built.title,
    userId: params.userId,
  });

  return {
    studioSpec,
    ...meta,
  };
}
