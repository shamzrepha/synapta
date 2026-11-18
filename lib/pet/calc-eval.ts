import { evaluate } from "@/lib/studio/expr";

export type CalcOutcome =
  | { kind: "empty" }
  | { kind: "graph" }
  | { kind: "value"; value: number; text: string }
  | { kind: "error"; message: string };

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  if (Math.abs(n) < 1e-12) return "0";
  if (Math.abs(n) >= 1e10 || (Math.abs(n) > 0 && Math.abs(n) < 1e-6)) {
    return n.toExponential(6).replace(/\.?0+e/, "e");
  }
  return Number(n.toPrecision(12)).toString();
}

/**
 * What the overlay calculator shows for the typed text. Maths goes through the safe expression parser (no eval, no
 * Function), and every failure, a typo, an unknown name or a division by nothing, comes back as an error value
 * instead of an exception, so one wrong key can never throw inside an event handler.
 */
export function evaluateCalculatorInput(raw: string, opts: { ans: number; radians: boolean }): CalcOutcome {
  const target = String(raw ?? "").trim();
  if (!target) return { kind: "empty" };
  if (/\bx\b/i.test(target)) return { kind: "graph" };
  try {
    const value = evaluate(target, { ans: opts.ans, Ans: opts.ans, ANS: opts.ans }, { radians: opts.radians });
    if (typeof value !== "number" || !Number.isFinite(value)) return { kind: "error", message: "Check syntax or domain" };
    return { kind: "value", value, text: formatNumber(value) };
  } catch {
    return { kind: "error", message: "Check syntax or domain" };
  }
}
