import { z } from "zod";
import { experimentById } from "./defs";

export const MAX_RUNS_PER_USER = 100;
export const MAX_ROWS = 60;

export const runSchema = z.object({
  experiment: z.string().max(30),
  title: z.string().trim().max(80).default(""),
  note: z.string().trim().max(500).default(""),
  /** slider settings at the time of saving */
  params: z.record(z.number().finite()).default({}),
  /** the data-table rows the student recorded */
  rows: z.array(z.record(z.number().finite())).min(1).max(MAX_ROWS),
  /** questions answered correctly (ids) */
  solved: z.array(z.string().max(30)).max(10).default([]),
});

export interface CleanRun {
  experiment: string;
  title: string;
  note: string;
  params: Record<string, number>;
  rows: Array<Record<string, number>>;
  solved: string[];
}

/** Keeps only columns and parameters the experiment really has, so a saved run can't carry arbitrary data. Returns null for an unknown experiment. */
export function cleanRun(input: z.input<typeof runSchema>): CleanRun | null {
  const e = experimentById(input.experiment);
  if (!e) return null;
  const columns = new Set(e.recordKeys);
  const paramKeys = new Set(e.params.map((p) => p.key));
  const pick = (o: Record<string, number> | undefined, keys: Set<string>) => Object.fromEntries(Object.entries(o ?? {}).filter(([k, v]) => keys.has(k) && Number.isFinite(v)));
  const rows = input.rows.map((r) => pick(r, columns)).filter((r) => Object.keys(r).length > 0);
  if (!rows.length) return null;
  const questionIds = new Set(e.questions.map((q) => q.id));
  return {
    experiment: e.id,
    title: input.title || `${e.title} run`,
    note: input.note ?? "",
    params: pick(input.params, paramKeys),
    rows,
    solved: Array.from(new Set((input.solved ?? []).filter((s) => questionIds.has(s)))),
  };
}
