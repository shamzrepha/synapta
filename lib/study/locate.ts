/** Finds where in a lesson an answer, question or card is explained, so learners can jump to the reference. */

export interface Block {
  index: number;
  text: string;
  /** the nearest heading above this block */
  heading: string;
}
export interface Ranked extends Block {
  score: number;
}

const STOP = new Set(
  "a an and are as at be but by for from has have how i if in into is it its of on or that the their them then there these they this to was were what when where which who why will with you your not no can do does did than so such also about after before between both each other over under more most some any all one two".split(" ")
);

export function tokens(text: string): string[] {
  return (String(text || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((t) => t.length > 2 && !STOP.has(t));
}

/** Splits markdown into readable blocks (paragraphs, list items, table rows), remembering the heading above each. */
export function toBlocks(markdown: string): Block[] {
  const out: Block[] = [];
  let heading = "";
  let fence = false;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    buf = [];
    if (text) out.push({ index: out.length, text, heading });
  };
  for (const line of String(markdown || "").replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      heading = h[2].replace(/[*_`]/g, "").trim();
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    // each list item / table row is its own block so the match is precise
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line) || /^\s*\|/.test(line)) {
      flush();
      buf.push(line.replace(/^\s*([-*+]|\d+[.)])\s+/, "").replace(/[|]/g, " "));
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

/** Share of the query's distinctive words found in the block, with a small bonus for matching phrases. */
export function scoreBlock(queryTokens: string[], block: string): number {
  if (queryTokens.length === 0) return 0;
  const bt = new Set(tokens(block));
  if (bt.size === 0) return 0;
  const uniq = [...new Set(queryTokens)];
  let hit = 0;
  for (const t of uniq) if (bt.has(t)) hit++;
  const bl = block.toLowerCase();
  let phrase = 0;
  for (let i = 0; i + 1 < queryTokens.length; i++) if (bl.includes(`${queryTokens[i]} ${queryTokens[i + 1]}`)) phrase++;
  return hit / uniq.length + Math.min(phrase, 4) * 0.08;
}

/** The blocks of a lesson best matching the query, best first (only those with a real overlap). */
export function rankBlocks(markdown: string, query: string, limit = 3): Ranked[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  return toBlocks(markdown)
    .map((b) => ({ ...b, score: scoreBlock(q, b.text) }))
    .filter((b) => b.score >= 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
