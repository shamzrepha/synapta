import type { CleanLine } from "./clean";

export interface Section {
  id: string;
  title: string;
  level: number;
  lineStart: number;
  lineEnd: number;
  pageNo: number;
  kindHint: "definition" | "list" | "procedure" | "table" | "prose" | "mixed";
}

/**
 * Repeated headings that make a note a condition template (spec S1). Recognised by rules before any model sees the text,
 * and passed to the extraction step as hints.
 */
export const CONDITION_HEADINGS = ["definition", "causes", "risk factors", "pathophysiology", "signs and symptoms", "diagnostics", "diagnosis", "prevention", "medical management", "pharmacological management", "nursing management", "complications"];
export const PROCEDURE_HEADINGS = ["indications", "contraindications", "requirements", "equipment", "procedure", "steps", "aftercare", "documentation"];

const normHead = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

export function isHeading(text: string): { level: number; title: string } | null {
  const t = text.trim();
  const md = /^(#{1,4})\s+(.+)$/.exec(t);
  if (md) return { level: md[1].length, title: md[2].trim() };
  const n = normHead(t);
  if ([...CONDITION_HEADINGS, ...PROCEDURE_HEADINGS].includes(n)) return { level: 2, title: t.replace(/[:：]\s*$/, "") };
  // "Part Two", "3. Nursing care": short titles only, so numbered STEPS ("1. Pinch the proximal end of the tube...") stay steps
  const numbered = /^(?:part\s+\w+|\d+(?:\.\d+)*[.)]?|[ivx]+[.)])\s+([A-Z][A-Za-z ,&/'-]{2,50})$/.exec(t);
  if (numbered && !/[.!?,]$/.test(t) && t.split(/\s+/).length <= 7 && !/\b(and|or|the|of|to|with)$/i.test(t)) return { level: 1, title: t };
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && t.length <= 70 && letters === letters.toUpperCase() && !/[.!?]$/.test(t)) return { level: 1, title: t.replace(/[:：]\s*$/, "") };
  if (t.length <= 60 && /:$/.test(t) && !/\s{2,}/.test(t) && t.split(" ").length <= 7) return { level: 2, title: t.replace(/:$/, "") };
  return null;
}

function kindOf(lines: CleanLine[]): Section["kindHint"] {
  if (lines.length === 0) return "prose";
  const numbered = lines.filter((l) => /^\s*(\d+[.)]|step\s*\d+)/i.test(l.text)).length;
  const bullets = lines.filter((l) => /^-\s/.test(l.text)).length;
  if (numbered >= 3 && numbered / lines.length >= 0.4) return "procedure";
  if (bullets >= 3 && bullets / lines.length > 0.5) return "list";
  if (lines.length <= 3 && lines.some((l) => /\b(is|are|refers to|means|defined as)\b/i.test(l.text))) return "definition";
  return bullets || numbered ? "mixed" : "prose";
}

/**
 * Builds the section tree by rules. Ranges cover every line with no gaps or overlaps (spec S1 deterministic check):
 * lines before the first heading become an "Introduction" section.
 */
export function buildOutline(lines: CleanLine[], pageNo = 1): Section[] {
  const heads: Array<{ at: number; level: number; title: string }> = [];
  lines.forEach((l, i) => {
    const h = isHeading(l.text);
    if (h) heads.push({ at: i, ...h });
  });
  if (heads.length === 0) return lines.length ? [{ id: "s1", title: "Notes", level: 1, lineStart: lines[0].lineNo, lineEnd: lines[lines.length - 1].lineNo, pageNo, kindHint: kindOf(lines) }] : [];
  const sections: Section[] = [];
  if (heads[0].at > 0) heads.unshift({ at: 0, level: 1, title: "Introduction" });
  heads.forEach((h, i) => {
    const endIdx = i + 1 < heads.length ? heads[i + 1].at - 1 : lines.length - 1;
    const body = lines.slice(h.at + (isHeading(lines[h.at].text) ? 1 : 0), endIdx + 1);
    sections.push({ id: `s${i + 1}`, title: h.title, level: h.level, lineStart: lines[h.at].lineNo, lineEnd: lines[endIdx].lineNo, pageNo, kindHint: kindOf(body) });
  });
  return sections;
}

/** Which template the headings suggest (a hint for extraction, not a decision). */
export function templateHint(sections: Section[]): "condition" | "procedure" | "none" {
  const heads = sections.map((s) => normHead(s.title));
  const cond = CONDITION_HEADINGS.filter((h) => heads.includes(h)).length;
  const proc = PROCEDURE_HEADINGS.filter((h) => heads.includes(h)).length;
  if (cond >= 3 && cond >= proc) return "condition";
  if (proc >= 3) return "procedure";
  return "none";
}
