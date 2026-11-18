/**
 * Keeping the page's words in step with a voice. The voice says a cleaned-up version of a paragraph (no markdown, formulas
 * spelled out), so its words are matched to the words really on the page in order, skipping what does not line up.
 */
export const normWord = (w: string): string => String(w || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");

const NUM_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
};

const canon = (w: string): string => NUM_WORDS[w] || w;

const same = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const ca = canon(a);
  const cb = canon(b);
  if (ca === cb) return true;
  // "ventricle" and "ventricles", "pumps" and "pumping"
  const n = Math.min(ca.length, cb.length);
  return n >= 4 && (ca.startsWith(cb) || cb.startsWith(ca)) && Math.abs(ca.length - cb.length) <= 4;
};

/** Words (runs of letters and digits) in a piece of text, with where each starts and ends. */
export function splitDomWords(text: string): Array<{ word: string; start: number; end: number }> {
  const out: Array<{ word: string; start: number; end: number }> = [];
  // hyphens split a word in two ("chest-tightness" is two spoken words); an apostrophe stays inside ("heart's")
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/**
 * For each spoken word, the index of the page word it is (or -1). Always moves forward; `from` is where to start looking (the end
 * of the last piece of the same paragraph). The first spoken word may be found anywhere ahead, later ones within a short reach so one
 * stray word cannot pull the match far away.
 */
export function alignSpoken(spoken: string[], dom: string[], from = 0, reach = 8): { map: number[]; next: number } {
  const d = dom.map(normWord);
  const sp = spoken.map(normWord);
  const map: number[] = [];
  let j = Math.max(0, from);
  let first = true;
  // Where the passage starts on the page: the first place where its first few spoken words follow one another. One word is not enough,
  // because the first word often appears earlier on the page too (a heading, a term), and the voice must not be matched to that one.
  const firstAt = sp.findIndex(Boolean);
  let anchor = -1;
  if (firstAt >= 0) {
    const run: string[] = [];
    for (let i = firstAt; i < sp.length && run.length < 3 && sp[i]; i++) run.push(sp[i]);
    for (let k = j; k + run.length <= d.length && anchor < 0; k++) {
      if (run.every((w, t) => same(d[k + t], w))) anchor = k;
    }
    // If a 3-word prefix didn't match (e.g. a formula or symbol at word 1), look for a 2-word consecutive pair near `j`
    if (anchor < 0) {
      const searchEnd = Math.min(d.length, j + 28);
      for (let start = firstAt; start < Math.min(sp.length - 1, firstAt + 4) && anchor < 0; start++) {
        const w1 = sp[start];
        const w2 = sp[start + 1];
        if (!w1 || !w2) continue;
        for (let k = j; k + 1 < searchEnd; k++) {
          if (same(d[k], w1) && same(d[k + 1], w2)) {
            anchor = Math.max(j, k - (start - firstAt));
            break;
          }
        }
      }
    }
  }
  for (let i = 0; i < sp.length; i++) {
    const s = sp[i];
    if (!s) {
      map.push(-1);
      continue;
    }
    let hit = -1;
    let span = 1;
    if (first && i === firstAt && anchor >= 0) {
      hit = anchor;
    } else {
      const limit = first ? d.length : Math.min(d.length, j + reach);
      for (let k = j; k < limit; k++) {
        if (same(d[k], s)) {
          hit = k;
          break;
        }
        // one spoken word that is two on the page ("chest-tightness" said as one word)
        if (k + 1 < d.length && s.length > 5 && s === d[k] + d[k + 1]) {
          hit = k;
          span = 2;
          break;
        }
      }
    }
    map.push(hit);
    if (hit >= 0) {
      j = hit + span;
      first = false;
    }
  }
  return { map, next: j };
}
