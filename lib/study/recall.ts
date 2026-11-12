/** Builds the "close the book and recall" check shown at the end of a chapter from the chapter's own summary and key terms. */

export interface RecallItem {
  /** what the learner sees: a sentence with the key word blanked, or a "what is X?" question */
  prompt: string;
  /** the answer revealed after the learner has tried */
  answer: string;
}

const strip = (s: string) => s.replace(/\\\(|\\\)|\$/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();

function sectionBullets(markdown: string, heading: RegExp): string[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let on = false;
  for (const line of lines) {
    const h = /^#{1,4}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      on = heading.test(h[1]);
      continue;
    }
    if (!on) continue;
    const b = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line);
    if (b) out.push(b[1].trim());
  }
  return out;
}

/** "A **diode** lets current pass one way" -> prompt with the bold word blanked, answer = the word. */
export function toCloze(bullet: string): RecallItem | null {
  const bold = /\*\*([^*]{2,40})\*\*/.exec(bullet);
  const plain = strip(bullet.replace(/\*\*/g, ""));
  if (plain.length < 20) return null;
  if (bold) {
    const word = strip(bold[1]);
    const prompt = strip(bullet.replace(bold[0], "_____").replace(/\*\*/g, ""));
    return { prompt, answer: word };
  }
  // no bold word: hide the last few words
  const words = plain.split(" ");
  if (words.length < 6) return null;
  const hide = Math.min(3, Math.floor(words.length / 3));
  return { prompt: `${words.slice(0, words.length - hide).join(" ")} _____`, answer: words.slice(-hide).join(" ").replace(/[.;,]$/, "") };
}

export function extractRecallItems(markdown: string, max = 4): RecallItem[] {
  const items: RecallItem[] = [];
  for (const b of sectionBullets(markdown, /summary|takeaway|key points|recap/i)) {
    const c = toCloze(b);
    if (c) items.push(c);
  }
  // key terms: "- **term**: meaning" becomes "What is term?"
  for (const b of sectionBullets(markdown, /key terms|glossary|vocabulary/i)) {
    const m = /^\*\*([^*]{2,40})\*\*\s*[:\-–—]\s*(.{10,})$/.exec(b);
    if (m) items.push({ prompt: `What is ${strip(m[1])}?`, answer: strip(m[2]).replace(/\*\*/g, "") });
  }
  // a spread of both kinds, never more than max
  const cloze = items.filter((i) => i.prompt.includes("_____"));
  const terms = items.filter((i) => !i.prompt.includes("_____"));
  const out: RecallItem[] = [];
  for (let i = 0; out.length < max && (i < cloze.length || i < terms.length); i++) {
    if (cloze[i]) out.push(cloze[i]);
    if (out.length < max && terms[i]) out.push(terms[i]);
  }
  return out;
}
