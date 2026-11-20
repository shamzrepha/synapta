import { evaluateRow, formatNumber, numFromNumber, resultText } from "@/lib/calculator/eval";
import { rowFromText } from "@/lib/calculator/from-text";

export { formatNumber };

export type CalcOutcome =
  | { kind: "empty" }
  | { kind: "graph" }
  | { kind: "value"; value: number; text: string }
  | { kind: "error"; message: string };

/**
 * Text entry point (used for Sprout pre-fills and tests). The text is converted to the calculator's expression
 * tree with a fixed vocabulary and evaluated by the safe tree evaluator: no eval, no Function, and every
 * failure comes back as a plain message instead of an exception.
 */
export function evaluateCalculatorInput(raw: string, opts: { ans: number; radians: boolean }): CalcOutcome {
  const target = String(raw ?? "").trim();
  if (!target) return { kind: "empty" };
  if (/\bx\b/i.test(target)) return { kind: "graph" };
  const row = rowFromText(target);
  if (!row) return { kind: "error", message: "Syntax error" };
  const out = evaluateRow(row, { radians: opts.radians, ans: numFromNumber(opts.ans) });
  if (out.kind === "empty") return { kind: "empty" };
  if (out.kind === "error") return { kind: "error", message: out.message };
  return { kind: "value", value: out.value.v, text: resultText(out.value, false) };
}
