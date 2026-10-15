import { CATALOG_BY_TYPE } from "./circuit/catalog";
import type { DesignSpec } from "./spec";

/** Turns a shop price like "₦3,000", "₦1,500–2,000" or "N500" into a number of naira (ranges use the higher figure). */
export function parseCost(cost: string | undefined | null): number {
  if (!cost) return 0;
  const nums = (String(cost).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((s) => Number(s.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : 0;
}

export function formatNaira(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-US")}`;
}

export interface BomLine {
  type: string;
  name: string;
  qty: number;
  unit: number;
  subtotal: number;
  /** ids of the circuit parts counted in this line */
  ids: string[];
}

export interface Bom {
  lines: BomLine[];
  total: number;
  /** part types in the circuit the shop does not know */
  unknown: string[];
}

/** Bill of materials from the design's circuit parts, priced with the shop's catalog. */
export function bomFor(spec: Pick<DesignSpec, "circuit">): Bom {
  const byType = new Map<string, BomLine>();
  const unknown: string[] = [];
  for (const p of spec.circuit?.parts || []) {
    const def = CATALOG_BY_TYPE[p.type];
    if (!def) {
      if (!unknown.includes(p.type)) unknown.push(p.type);
      continue;
    }
    const line = byType.get(p.type) || { type: p.type, name: def.name, qty: 0, unit: parseCost(def.cost), subtotal: 0, ids: [] };
    line.qty += 1;
    line.subtotal = line.qty * line.unit;
    line.ids.push(p.id);
    byType.set(p.type, line);
  }
  const lines = Array.from(byType.values());
  return { lines, total: lines.reduce((s, l) => s + l.subtotal, 0), unknown };
}

export function partTypesUsed(spec: Pick<DesignSpec, "circuit">): string[] {
  return Array.from(new Set((spec.circuit?.parts || []).map((p) => p.type)));
}
