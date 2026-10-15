import { z } from "zod";
import { bomFor, formatNaira, type Bom } from "./bom";
import { ALWAYS_ALLOWED } from "./parts/shop";
import { verifyStep } from "./verify";
import type { DesignSpec } from "./spec";

/** Build contests: creation schema, entry validation (budget, allowed parts, step checks) and winner selection. */

export const contestSchema = z.object({
  title: z.string().trim().min(3).max(80),
  brief: z.string().trim().min(10).max(2000),
  /** ISO date-time */
  deadline: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid deadline"),
  /** naira */
  budget: z.number().int().min(0).max(10_000_000),
  /** circuit part types; empty = any shop part */
  allowedParts: z.array(z.string().max(30)).max(40).default([]),
});

export interface EntryCheck {
  ok: boolean;
  bom: Bom;
  cost: number;
  problems: string[];
}

/** Server-side entry validation. Never trusts the client's idea of cost or step status. */
export function validateEntry(spec: DesignSpec, contest: { budget: number; allowedParts: string[] }): EntryCheck {
  const bom = bomFor(spec);
  const problems: string[] = [];
  if (bom.lines.length === 0) problems.push("The design has no circuit parts, so there is no parts list to cost.");
  if (bom.unknown.length) problems.push(`Unknown parts: ${bom.unknown.join(", ")}.`);
  if (bom.total > contest.budget) problems.push(`Parts cost ${formatNaira(bom.total)}, over the ${formatNaira(contest.budget)} budget by ${formatNaira(bom.total - contest.budget)}.`);
  if (contest.allowedParts.length) {
    const allowed = new Set([...contest.allowedParts, ...ALWAYS_ALLOWED]);
    const bad = bom.lines.filter((l) => !allowed.has(l.type));
    if (bad.length) problems.push(`Not allowed in this contest: ${bad.map((l) => l.name).join(", ")}.`);
  }
  for (const step of spec.steps) {
    if (step.check.kind === "manual") continue;
    try {
      const r = verifyStep(spec, step);
      if (!r.done) problems.push(`Step “${step.title}” does not pass: ${r.message}`);
    } catch {
      // a check that cannot run is not held against the entrant
    }
  }
  return { ok: problems.length === 0, bom, cost: bom.total, problems };
}

export interface EntryTally {
  uid: string;
  votes: number;
  createdAt: string;
}

/** Most votes wins; ties go to the earlier entry. Returns null when nobody entered. */
export function pickWinner<T extends EntryTally>(entries: T[]): T | null {
  if (!entries.length) return null;
  return [...entries].sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt))[0];
}

export function isClosed(c: { status: string; deadline: string }, now: number): boolean {
  return c.status === "closed" || Date.parse(c.deadline) <= now;
}
