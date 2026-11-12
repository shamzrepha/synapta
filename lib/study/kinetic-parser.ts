import { z } from "zod";

export const fractionSlashSceneSchema = z.object({
  kind: z.literal("fraction_slash"),
  title: z.string().max(120).optional(),
  num: z.number().int().min(1).max(99),
  den: z.number().int().min(2).max(99),
  divisor: z.number().int().min(1).max(99).optional(),
  caption: z.string().max(240).optional(),
});

export const equationStepSchema = z.object({
  expr: z.string().trim().min(1).max(160),
  note: z.string().trim().max(180).optional(),
  slashTerm: z.string().trim().max(48).optional(),
});

export const equationStepsSceneSchema = z.object({
  kind: z.literal("equation_steps"),
  title: z.string().max(120).optional(),
  steps: z.array(equationStepSchema).min(2).max(6),
});

export const formulaPartSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  meaning: z.string().trim().min(1).max(120),
  unit: z.string().trim().max(24).optional(),
  varKey: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
  defaultVal: z.number().min(-10000).max(10000).optional(),
  min: z.number().min(-10000).max(10000).optional(),
  max: z.number().min(-10000).max(10000).optional(),
  step: z.number().positive().max(1000).optional(),
});

export const formulaBreakdownSceneSchema = z.object({
  kind: z.literal("formula_breakdown"),
  title: z.string().max(120).optional(),
  lhs: z.string().trim().min(1).max(32),
  rhs: z.string().trim().min(1).max(80),
  formulaExpr: z.string().trim().max(120).optional(),
  parts: z.array(formulaPartSchema).min(1).max(6),
});

export const conceptNodeSchema = z.object({
  label: z.string().trim().min(1).max(48),
  detail: z.string().trim().max(140).optional(),
  badge: z.string().trim().max(24).optional(),
});

export const conceptFlowSceneSchema = z.object({
  kind: z.literal("concept_flow"),
  title: z.string().max(120).optional(),
  nodes: z.array(conceptNodeSchema).min(2).max(5),
});

export const kidCounterSceneSchema = z.object({
  kind: z.literal("kid_counter"),
  title: z.string().max(120).optional(),
  prompt: z.string().trim().min(1).max(120),
  left: z.number().int().min(0).max(12),
  right: z.number().int().min(0).max(12),
  op: z.enum(["+", "-", "×"]),
  token: z.string().trim().min(1).max(8).optional(),
});

export const kineticSceneSchema = z.discriminatedUnion("kind", [
  fractionSlashSceneSchema,
  equationStepsSceneSchema,
  formulaBreakdownSceneSchema,
  conceptFlowSceneSchema,
  kidCounterSceneSchema,
]);

export type KineticScene = z.infer<typeof kineticSceneSchema>;
export type FractionSlashScene = z.infer<typeof fractionSlashSceneSchema>;
export type EquationStepsScene = z.infer<typeof equationStepsSceneSchema>;
export type FormulaBreakdownScene = z.infer<typeof formulaBreakdownSceneSchema>;
export type ConceptFlowScene = z.infer<typeof conceptFlowSceneSchema>;
export type KidCounterScene = z.infer<typeof kidCounterSceneSchema>;

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return Math.max(1, x);
}

/** Parses an untrusted JSON payload into one or more validated `KineticScene` entries. */
export function parseKineticBlock(rawJson: string): KineticScene[] {
  const trimmed = rawJson.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const valid: KineticScene[] = [];
  for (const item of items) {
    const res = kineticSceneSchema.safeParse(item);
    if (res.success) valid.push(res.data);
  }
  return valid;
}

const MOTION_FENCE_RE = /```(?:sunroot-motion|kinetic-math)\s*\n([\s\S]*?)```/gi;

/** Strips validated animation blocks from markdown so prose stays clean while returning scenes. */
export function stripAndExtractKineticBlocks(markdown: string): {
  cleanMarkdown: string;
  explicitScenes: KineticScene[];
} {
  const explicitScenes: KineticScene[] = [];
  const cleanMarkdown = markdown
    .replace(MOTION_FENCE_RE, (_whole, body: string) => {
      const scenes = parseKineticBlock(body);
      for (const s of scenes) {
        if (explicitScenes.length < 4) explicitScenes.push(s);
      }
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleanMarkdown, explicitScenes };
}

/** Cleans basic LaTeX tokens into crisp readable expression text for SVG formula stages. */
function cleanMathText(raw: string): string {
  return raw
    .replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2")
    .replace(/\\cdot/g, " · ")
    .replace(/\\times/g, " × ")
    .replace(/\\div/g, " ÷ ")
    .replace(/\\pi/g, "π")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\theta/g, "θ")
    .replace(/\\lambda/g, "λ")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\\text\{([^{}]+)\}/g, "$1")
    .replace(/\\left|\\right|&/g, "")
    .replace(/^\$\$|\$\$$|^\$|\$$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNonMathNoise(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/[^\s)>\]]+/gi, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\b\d{1,4}\/\d{1,2}\/\d{1,4}\b/g, " ");
}

function detectFractionScene(text: string): FractionSlashScene | null {
  const candidates: Array<{ num: number; den: number; g: number }> = [];

  const latexRe = /\\(?:d|t)?frac\{\s*(\d{1,2})\s*\}\{\s*(\d{1,2})\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = latexRe.exec(text)) !== null) {
    const num = Number(m[1]);
    const den = Number(m[2]);
    if (num >= 1 && den >= 2 && num <= den * 2) {
      candidates.push({ num, den, g: gcd(num, den) });
    }
  }

  const slashRe = /(?:^|[^0-9A-Za-z/.])(\d{1,2})\s*\/\s*(\d{1,2})(?=[^0-9A-Za-z/]|$)/g;
  while ((m = slashRe.exec(text)) !== null) {
    const num = Number(m[1]);
    const den = Number(m[2]);
    if (num >= 1 && den >= 2 && num <= 24 && den <= 36) {
      candidates.push({ num, den, g: gcd(num, den) });
    }
  }

  if (candidates.length === 0) return null;
  // Prefer non-trivial reducible fractions (e.g. 2/4, 6/8) so the slash cancellation animation shines
  const reducible = candidates.find((c) => c.g > 1 && c.num !== c.den);
  const pick = reducible ?? candidates.find((c) => c.num < c.den) ?? candidates[0];
  const rNum = pick.num / pick.g;
  const rDen = pick.den / pick.g;

  return {
    kind: "fraction_slash",
    title: pick.g > 1 ? "Simplifying Fractions" : "Visual Fraction",
    num: pick.num,
    den: pick.den,
    divisor: pick.g > 1 ? pick.g : undefined,
    caption:
      pick.g > 1
        ? `Divide both ${pick.num} and ${pick.den} by ${pick.g} → ${rNum}/${rDen}`
        : `${pick.num} out of ${pick.den} equal parts`,
  };
}

function detectEquationStepsScene(md: string): EquationStepsScene | null {
  const displayBlocks = [...md.matchAll(/\$\$([\s\S]*?)\$\$/g)];
  for (const blk of displayBlocks) {
    const body = blk[1]
      .replace(/\\begin\{aligned\*?\}|\\end\{aligned\*?\}/g, "")
      .trim();
    const rawLines = body
      .split(/\\\\|\r?\n/)
      .map((l) => cleanMathText(l))
      .filter((l) => l.length >= 3 && (l.includes("=") || l.includes("→") || l.includes("⇒")));
    if (rawLines.length >= 2) {
      return {
        kind: "equation_steps",
        title: "Step-by-Step Derivation",
        steps: rawLines.slice(0, 6).map((expr, idx) => ({
          expr,
          note: idx === 0 ? "Start" : idx === rawLines.length - 1 ? "Result" : `Step ${idx + 1}`,
        })),
      };
    }
  }

  // Also detect explicit arrow derivations in plain lines like "2x + 4 = 10 -> 2x = 6 -> x = 3"
  for (const line of md.split(/\r?\n/)) {
    if (/->|⇒|→/.test(line) && line.includes("=")) {
      const parts = line
        .replace(/^[-*•\s]+/, "")
        .split(/\s*(?:->|⇒|→)\s*/)
        .map((p) => cleanMathText(p))
        .filter((p) => p.includes("=") && p.length <= 60);
      if (parts.length >= 2) {
        return {
          kind: "equation_steps",
          title: "Solving Step-by-Step",
          steps: parts.slice(0, 6).map((expr, idx) => ({
            expr,
            note: idx === 0 ? "Given" : idx === parts.length - 1 ? "Solved" : "Next step",
          })),
        };
      }
    }
  }
  return null;
}

const KNOWN_SYMBOLS: Record<string, { meaning: string; unit?: string }> = {
  F: { meaning: "Force", unit: "N" },
  m: { meaning: "Mass", unit: "kg" },
  a: { meaning: "Acceleration", unit: "m/s²" },
  E: { meaning: "Energy", unit: "J" },
  c: { meaning: "Speed of light", unit: "m/s" },
  V: { meaning: "Voltage", unit: "V" },
  I: { meaning: "Current", unit: "A" },
  R: { meaning: "Resistance", unit: "Ω" },
  P: { meaning: "Power / Pressure", unit: "W" },
  v: { meaning: "Velocity", unit: "m/s" },
  u: { meaning: "Initial velocity", unit: "m/s" },
  t: { meaning: "Time", unit: "s" },
  r: { meaning: "Radius" },
  h: { meaning: "Height" },
  b: { meaning: "Base" },
};

function detectFormulaBreakdownScene(md: string): FormulaBreakdownScene | null {
  const mathCandidates: string[] = [];
  for (const m of md.matchAll(/\$\$([^$]+)\$\$|\$([^$\n]+)\$/g)) {
    const raw = (m[1] || m[2] || "").trim();
    const cleaned = cleanMathText(raw);
    if (
      cleaned.includes("=") &&
      !/\\begin/.test(raw) &&
      cleaned.length >= 5 &&
      cleaned.length <= 40
    ) {
      mathCandidates.push(cleaned);
    }
  }

  for (const eq of mathCandidates) {
    const eqParts = eq.split("=").map((s) => s.trim());
    if (eqParts.length !== 2) continue;
    const [lhs, rhs] = eqParts;
    if (!/^[A-Za-zΔθλ][A-Za-z0-9_²³]*$/.test(lhs) || !rhs) continue;

    // Look for variable bullets near the note ("- F = Force", "* m is mass", "- `a`: acceleration")
    const bulletMap = new Map<string, string>();
    const bulletRe = /^[-*•]\s*[*`$]*([A-Za-zΔθλ][A-Za-z0-9_]*)[*`$]*\s*(?:=|:|is|stands for|means|-|–)\s*([^\n]{3,80})/gim;
    let bm: RegExpExecArray | null;
    while ((bm = bulletRe.exec(md)) !== null) {
      bulletMap.set(bm[1], bm[2].replace(/[*`]/g, "").trim());
    }

    const tokens = [...new Set([lhs, ...(rhs.match(/[A-Za-zΔθλ][A-Za-z0-9_]*/g) || [])])].filter(
      (t) => t !== "sin" && t !== "cos" && t !== "tan" && t !== "log" && t !== "sqrt",
    );
    const parts = tokens
      .map((sym) => {
        const desc = bulletMap.get(sym) || KNOWN_SYMBOLS[sym]?.meaning;
        if (!desc) return null;
        return {
          symbol: sym,
          meaning: desc,
          unit: KNOWN_SYMBOLS[sym]?.unit,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .slice(0, 6);

    if (parts.length >= 2) {
      return {
        kind: "formula_breakdown",
        title: "Live Formula Explorer",
        lhs,
        rhs,
        parts,
      };
    }
  }
  return null;
}

function detectKidCounterScene(text: string): KidCounterScene | null {
  const m = /(?:^|[\s(])(\d{1,2})\s*([+\-×*])\s*(\d{1,2})\s*=\s*(\d{1,3})(?=[\s.,!?)]|$)/.exec(text);
  if (!m) return null;
  const left = Number(m[1]);
  const rawOp = m[2] === "*" ? "×" : m[2];
  const right = Number(m[3]);
  if (left > 10 || right > 10) return null;
  if (rawOp !== "+" && rawOp !== "-" && rawOp !== "×") return null;
  if (rawOp === "-" && left < right) return null;
  return {
    kind: "kid_counter",
    title: "Visual Counter",
    prompt: `${left} ${rawOp} ${right}`,
    left,
    right,
    op: rawOp,
    token: rawOp === "×" ? "⭐" : rawOp === "-" ? "🍓" : "🍎",
  };
}

function detectConceptFlowScene(text: string): ConceptFlowScene | null {
  for (const line of text.split(/\r?\n/)) {
    if (line.includes("=") || !/(?:->|→|⇒)/.test(line)) continue;
    const cleanedLine = line.replace(/^[-*•#\d.\s]+/, "").trim();
    const nodes = cleanedLine
      .split(/\s*(?:->|→|⇒)\s*/)
      .map((s) => s.replace(/[*`_]/g, "").trim())
      .filter((s) => s.length >= 2 && s.length <= 44);
    if (nodes.length >= 2 && nodes.length <= 5) {
      return {
        kind: "concept_flow",
        title: "Concept Flow",
        nodes: nodes.map((label, idx) => ({
          label,
          badge: String(idx + 1),
        })),
      };
    }
  }
  return null;
}

/**
 * Combines author/AI explicit `sunroot-motion` scenes with automatically inferred procedural
 * animations from standard Markdown/LaTeX on the current page (max 2 scenes per page).
 */
export function extractKineticScenesForPage(markdown: string, pageTitle?: string): {
  cleanMarkdown: string;
  scenes: KineticScene[];
} {
  const { cleanMarkdown, explicitScenes } = stripAndExtractKineticBlocks(markdown);
  const scenes: KineticScene[] = [...explicitScenes];

  if (scenes.length < 2) {
    const cleanText = stripNonMathNoise(cleanMarkdown);
    const hasKind = (k: KineticScene["kind"]) => scenes.some((s) => s.kind === k);

    const frac = !hasKind("fraction_slash") ? detectFractionScene(cleanText) : null;
    if (frac) scenes.push(frac);

    if (scenes.length < 2 && !hasKind("equation_steps")) {
      const eq = detectEquationStepsScene(cleanMarkdown);
      if (eq) scenes.push(eq);
    }

    if (scenes.length < 2 && !hasKind("formula_breakdown")) {
      const formula = detectFormulaBreakdownScene(cleanMarkdown);
      if (formula) scenes.push(formula);
    }

    if (scenes.length < 2 && !hasKind("kid_counter")) {
      const counter = detectKidCounterScene(cleanText);
      if (counter) scenes.push(counter);
    }

    if (scenes.length < 2 && !hasKind("concept_flow")) {
      const flow = detectConceptFlowScene(cleanText);
      if (flow) scenes.push(flow);
    }
  }

  void pageTitle;
  return {
    cleanMarkdown,
    scenes: scenes.slice(0, 2),
  };
}
