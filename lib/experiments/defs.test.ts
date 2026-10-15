import { describe, it, expect } from "vitest";
import { EXPERIMENTS, defaultValues, recordRow, columnLabel, experimentById } from "./defs";
import { checkAnswer } from "./questions";
import { drawGraph } from "./plot";

/** A canvas context that accepts every call (we only check that drawing never throws). */
function fakeCtx(): CanvasRenderingContext2D {
  const fn = () => undefined;
  return new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : fn),
    set: (t, k, v) => ((t[k as string] = v), true),
  }) as unknown as CanvasRenderingContext2D;
}

describe("experiment framework", () => {
  it("has the four experiments with unique ids", () => {
    expect(EXPERIMENTS.map((e) => e.id)).toEqual(["projectile", "pendulum", "titration", "gas"]);
    expect(experimentById("gas")?.title).toMatch(/gas/i);
    expect(experimentById("nope")).toBeUndefined();
  });

  for (const e of EXPERIMENTS) {
    describe(e.id, () => {
      const v = defaultValues(e);
      const c = e.compute(v);
      it("computes finite outputs, a graph, and draws without errors", () => {
        for (const o of c.outputs) if (o.key !== "periodMeasured") expect(Number.isFinite(o.value), o.key).toBe(true);
        expect(c.graphs.length).toBeGreaterThan(0);
        for (const t of [0, 0.7, 5]) {
          e.draw(fakeCtx(), 360, 260, v, c, t);
          for (const g of c.graphs) drawGraph(fakeCtx(), 360, 200, g, t);
        }
      });
      it("every slider default is inside its range and every option is valid", () => {
        for (const p of e.params) {
          expect(p.value).toBeGreaterThanOrEqual(p.min);
          expect(p.value).toBeLessThanOrEqual(p.max);
          if (p.options) expect(p.options.some((o) => o.value === p.value)).toBe(true);
        }
      });
      it("records a row with every column and labels each column", () => {
        const row = recordRow(e, v, c);
        for (const k of e.recordKeys) {
          if (k === "periodMeasured") continue;
          expect(row[k], k).toBeDefined();
          expect(columnLabel(e, k)).not.toBe(k);
        }
      });
      it("survives the extremes of every slider", () => {
        for (const p of e.params) {
          for (const x of [p.min, p.max]) {
            const vv = { ...v, [p.key]: x };
            const cc = e.compute(vv);
            for (const o of cc.outputs) expect(Number.isNaN(o.value) && o.key !== "periodMeasured").toBe(false);
            e.draw(fakeCtx(), 300, 220, vv, cc, 1.3);
          }
        }
      });
      it("accepts the right answer to every question and rejects a wrong one", () => {
        for (const q of e.questions) {
          if (q.kind === "number") {
            const exp = q.expected(v, c);
            expect(checkAnswer(q, String(exp), v, c).correct, q.id).toBe(true);
            expect(checkAnswer(q, String(exp * 1.5 + 5), v, c).correct, q.id).toBe(false);
            expect(checkAnswer(q, "abc", v, c).correct).toBe(false);
            expect(q.hint(v, c).length).toBeGreaterThan(5);
          } else {
            const exp = q.expected(v, c);
            expect(q.options).toContain(exp);
            expect(checkAnswer(q, exp, v, c).correct).toBe(true);
            const wrong = q.options.find((o) => o !== exp)!;
            expect(checkAnswer(q, wrong, v, c).correct).toBe(false);
            expect(checkAnswer(q, "", v, c).correct).toBe(false);
          }
        }
      });
    });
  }

  it("question answers follow the sliders (not fixed numbers)", () => {
    const p = experimentById("projectile")!;
    const v1 = { ...defaultValues(p), speed: 20 };
    const v2 = { ...defaultValues(p), speed: 40 };
    const range = p.questions[0];
    expect(range.kind === "number" && range.expected(v2, p.compute(v2))).toBeGreaterThan(range.kind === "number" ? range.expected(v1, p.compute(v1)) : 0);
    const best = p.questions[1];
    expect(best.kind === "number" && best.expected({ ...v1, height: 0 }, p.compute(v1))).toBeCloseTo(45, 4);
    expect(best.kind === "number" && best.expected({ ...v1, height: 20 }, p.compute(v1))).toBeLessThan(45);
  });

  it("titration: the right indicator depends on the acid, and the weak acid's equivalence pH is above 7", () => {
    const t = experimentById("titration")!;
    const strong = { ...defaultValues(t), weak: 0 };
    const weak = { ...defaultValues(t), weak: 1 };
    const q = t.questions[2];
    expect(q.kind === "choice" && q.expected(strong, t.compute(strong))).toBe("Bromothymol blue");
    expect(q.kind === "choice" && q.expected(weak, t.compute(weak))).toBe("Phenolphthalein");
    expect(t.compute(weak).outputs.find((o) => o.key === "peq")!.value).toBeGreaterThan(7);
    expect(t.compute({ ...strong, vb: 25 }).outputs.find((o) => o.key === "pH")!.value).toBeCloseTo(7, 1);
  });

  it("gas: the pressure follows PV = nRT as the sliders move", () => {
    const g = experimentById("gas")!;
    const v = defaultValues(g);
    const P = (vv: Record<string, number>) => g.compute(vv).outputs.find((o) => o.key === "P")!.value;
    expect(P({ ...v, x: v.x / 2 })).toBeCloseTo(2 * P(v), 6);
    expect(P({ ...v, T: v.T * 2 })).toBeCloseTo(2 * P(v), 6);
    expect(g.compute(v).outputs.find((o) => o.key === "PVnT")!.value).toBeCloseTo(8.314, 2);
  });
});
