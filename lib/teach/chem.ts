/** Counts atoms in a chemical formula and checks whether an equation is balanced (for the balancing block). */

export function parseFormula(formula: string): Record<string, number> | null {
  const s = formula.replace(/\s+/g, "");
  if (!s || s.length > 40) return null;
  let i = 0;
  const readNum = () => {
    let n = "";
    while (i < s.length && /[0-9]/.test(s[i])) n += s[i++];
    return n ? Number(n) : 1;
  };
  const group = (): Record<string, number> | null => {
    const counts: Record<string, number> = {};
    while (i < s.length && s[i] !== ")") {
      if (s[i] === "(") {
        i++;
        const inner = group();
        if (!inner || s[i] !== ")") return null;
        i++;
        const k = readNum();
        for (const [el, n] of Object.entries(inner)) counts[el] = (counts[el] || 0) + n * k;
      } else if (/[A-Z]/.test(s[i])) {
        let el = s[i++];
        while (i < s.length && /[a-z]/.test(s[i])) el += s[i++];
        counts[el] = (counts[el] || 0) + readNum();
      } else return null;
    }
    return counts;
  };
  const r = group();
  return r && i === s.length && Object.keys(r).length ? r : null;
}

export interface Side {
  formula: string;
  coef: number;
}

export function countSide(side: Side[]): Record<string, number> | null {
  const total: Record<string, number> = {};
  for (const t of side) {
    const f = parseFormula(t.formula);
    if (!f) return null;
    for (const [el, n] of Object.entries(f)) total[el] = (total[el] || 0) + n * t.coef;
  }
  return total;
}

export function isBalanced(reactants: Side[], products: Side[]): boolean {
  const a = countSide(reactants);
  const b = countSide(products);
  if (!a || !b) return false;
  const els = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const el of els) if ((a[el] || 0) !== (b[el] || 0)) return false;
  return true;
}

/** "Ca(OH)2" → "Ca(OH)₂" for display. */
export function subscripts(formula: string): string {
  const sub = "₀₁₂₃₄₅₆₇₈₉";
  return formula.replace(/(?<=[A-Za-z)])(\d+)/g, (d) => [...d].map((c) => sub[Number(c)]).join(""));
}
