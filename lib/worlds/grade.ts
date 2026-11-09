import { normalize, tokens } from "./fuzzy";
import type { Cloze, Matching, Mcq, Ordering } from "./activities";

/** Edit distance, for forgiving a typo in a longer word. */
function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]) as number[][];
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

export function gradeCloze(a: Cloze, typed: string): boolean {
  const t = normalize(typed);
  if (!t) return false;
  return a.blanks[0].accept.some((acc) => {
    const n = normalize(acc);
    if (t === n) return true;
    // one slip in a long word is not a wrong answer; numbers must match exactly
    return n.length >= 6 && !/\d/.test(n) && distance(t, n) <= 1;
  });
}

export const gradeMcq = (a: Mcq, index: number): boolean => index === a.correctIndex;
export const gradeOrdering = (a: Ordering, order: string[]): boolean => order.length === a.items.length && order.every((x, i) => normalize(x) === normalize(a.items[i]));
export const gradeMatching = (a: Matching, pairs: Array<{ left: string; right: string }>): boolean => pairs.length === a.pairs.length && a.pairs.every((p) => pairs.some((q) => q.left === p.left && q.right === p.right));

export function sameWords(a: string, b: string): boolean {
  return tokens(a).join(" ") === tokens(b).join(" ");
}
