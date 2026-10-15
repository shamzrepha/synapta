import type { DesignSpec } from "./spec";

/** What changed between two versions of a design — shown in history and on each commit. */
export interface SpecDiff {
  lines: string[];
  added: number;
  removed: number;
  changed: number;
}

function byId<T extends { id: string }>(list: T[] | undefined): Map<string, T> {
  return new Map((list || []).map((x) => [x.id, x]));
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Line counts for a code change (LCS on lines, bounded so huge files stay cheap). */
export function lineDiff(a: string, b: string): { added: number; removed: number } {
  const A = a.split("\n").slice(0, 800);
  const B = b.split("\n").slice(0, 800);
  const m = A.length;
  const n = B.length;
  let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) cur[j] = A[i - 1] === B[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  const common = prev[n];
  return { added: n - common, removed: m - common };
}

function diffList<T extends { id: string }>(
  label: string,
  before: T[] | undefined,
  after: T[] | undefined,
  name: (x: T) => string,
  out: SpecDiff
) {
  const A = byId(before);
  const B = byId(after);
  for (const [id, x] of B) {
    if (!A.has(id)) {
      out.lines.push(`+ ${label} ${name(x)}`);
      out.added++;
    } else if (!same(A.get(id), x)) {
      out.lines.push(`~ ${label} ${name(x)}`);
      out.changed++;
    }
  }
  for (const [id, x] of A) {
    if (!B.has(id)) {
      out.lines.push(`- ${label} ${name(x)}`);
      out.removed++;
    }
  }
}

export function diffSpecs(before: DesignSpec | null, after: DesignSpec): SpecDiff {
  const out: SpecDiff = { lines: [], added: 0, removed: 0, changed: 0 };
  if (!before) {
    out.lines.push("Created design");
    return out;
  }
  if (before.kind !== after.kind) {
    out.lines.push(`~ type ${before.kind} → ${after.kind}`);
    out.changed++;
  }
  // Parameters: report value changes plainly ("width 200 → 240 mm")
  const PA = new Map(before.params.map((p) => [p.key, p]));
  const PB = new Map(after.params.map((p) => [p.key, p]));
  for (const [k, p] of PB) {
    const old = PA.get(k);
    if (!old) {
      out.lines.push(`+ setting ${p.label}`);
      out.added++;
    } else if (old.value !== p.value) {
      out.lines.push(`~ ${p.label} ${old.value} → ${p.value}${p.unit ? ` ${p.unit}` : ""}`);
      out.changed++;
    } else if (!same(old, p)) {
      out.lines.push(`~ setting ${p.label}`);
      out.changed++;
    }
  }
  for (const [k, p] of PA) {
    if (!PB.has(k)) {
      out.lines.push(`- setting ${p.label}`);
      out.removed++;
    }
  }
  diffList("part", before.parts, after.parts, (x) => x.name, out);
  diffList("component", before.circuit?.parts, after.circuit?.parts, (x) => x.label || x.id, out);
  diffList("wire", before.circuit?.wires, after.circuit?.wires, (x) => `${x.from} → ${x.to}`, out);
  if ((before.code || "") !== (after.code || "")) {
    const d = lineDiff(before.code || "", after.code || "");
    out.lines.push(`~ code +${d.added} −${d.removed} lines`);
    out.changed++;
  }
  const MA = before.mechanism;
  const MB = after.mechanism;
  if (MA && MB) {
    const n = Math.max(MA.stages.length, MB.stages.length);
    for (let i = 0; i < n; i++) {
      const a = MA.stages[i];
      const b = MB.stages[i];
      if (!a && b) {
        out.lines.push(`+ gear stage ${i + 1} (${b.driverTeeth}:${b.drivenTeeth})`);
        out.added++;
      } else if (a && !b) {
        out.lines.push(`- gear stage ${i + 1}`);
        out.removed++;
      } else if (a && b && !same(a, b)) {
        out.lines.push(`~ gear stage ${i + 1} ${a.driverTeeth}:${a.drivenTeeth} → ${b.driverTeeth}:${b.drivenTeeth}`);
        out.changed++;
      }
    }
    const fields: Array<[string, unknown, unknown]> = [
      ["load", MA.load.mass, MB.load.mass],
      ["drum radius", MA.drumRadius, MB.drumRadius],
      ["module", MA.module, MB.module],
      ["pulleys", MA.pulleyAdvantage, MB.pulleyAdvantage],
      ["lift height", MA.liftHeight, MB.liftHeight],
      ["input", MA.input, MB.input],
    ];
    for (const [label, a, b] of fields) {
      if (!same(a, b)) {
        out.lines.push(typeof a === "number" ? `~ ${label} ${a} → ${b}` : `~ ${label}`);
        out.changed++;
      }
    }
  } else if (!MA && MB) {
    out.lines.push("+ mechanism");
    out.added++;
  } else if (MA && !MB) {
    out.lines.push("- mechanism");
    out.removed++;
  }
  diffList("step", before.steps, after.steps, (x) => x.title, out);
  diffList("test", before.tests, after.tests, (x) => x.title, out);
  if (before.summary !== after.summary || (before.notes || "") !== (after.notes || "")) {
    out.lines.push("~ description");
    out.changed++;
  }
  if (out.lines.length === 0) out.lines.push("No changes");
  return out;
}
