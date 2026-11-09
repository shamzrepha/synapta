import { normalize } from "./fuzzy";

export interface RawLine {
  text: string;
  confidence?: number;
}
export interface CleanLine {
  lineNo: number;
  text: string;
  confidence: number;
  flagged?: boolean;
  /** why the line is flagged, in plain words, for the review screen */
  flagReason?: string;
}
export interface Repair {
  lineNo: number;
  kind: "junk_removed" | "boilerplate_removed" | "duplicate_removed" | "symbol_repaired" | "wrapped_merged";
  before: string;
  after?: string;
}

export const FLAG_BELOW = 0.75;

/** Lines that chat tools leave behind when a note is pasted from them (spec S0). */
const BOILERPLATE = [
  /^\s*(in|for) the next (part|section|message)[, ]/i,
  /^\s*next\s*:\s*(a )?(comprehensive|detailed)/i,
  /^\s*(here('| i)s|below is) (a|the|your) (comprehensive|detailed|complete)/i,
  /^\s*(would you like|let me know if|do you want me to)\b/i,
  /^\s*(sure|certainly|absolutely)[!,.]/i,
  /^\s*(sources?|references?)\s*:\s*(cdc|who|nhs|mayo)/i,
];
/** A line that is only a citation tag left after a sentence. */
const CITATION_ONLY = /^\s*(cdc|who|nhs|mayo clinic|world health organization|centers for disease control[^.]*)\s*$/i;
const JUNK_CHARS = /[�​-‍﻿]/g;

/** A drug list where a letter in a circle was pasted as a symbol: "Rifampicin ®", "Ethambutol €" mean (R) and (E) of RHZE. */
const SYMBOL_FIXES: Array<{ re: RegExp; to: string }> = [
  { re: /\s*®(?=\s|$|[.,;)])/g, to: " (R)" },
  { re: /\s*€(?=\s|$|[.,;)])/g, to: " (E)" },
];

const BULLETS = /^[\s]*[•·▪■●◦‣⁃–—*]+\s+/;
const LIST_STARTS = /^\s*(?:[-•·▪■●◦‣⁃*]|\d+[.)]|[a-z][.)]|#)\s/i;

/**
 * Rule-based cleanup of extracted text (spec S0). Nothing is silently "fixed": every change is logged in `repairs`,
 * and anything uncertain is flagged for the student to confirm (R2).
 */
export function cleanLines(raw: RawLine[]): { lines: CleanLine[]; repairs: Repair[] } {
  const repairs: Repair[] = [];
  const seenParagraphs = new Set<string>();
  const kept: Array<{ text: string; confidence: number; flagReason?: string }> = [];

  raw.forEach((r, idx) => {
    let text = r.text.replace(/\r/g, "");
    if (JUNK_CHARS.test(text)) {
      repairs.push({ lineNo: idx + 1, kind: "junk_removed", before: text, after: text.replace(JUNK_CHARS, "") });
      text = text.replace(JUNK_CHARS, "");
    }
    JUNK_CHARS.lastIndex = 0;
    text = text.replace(BULLETS, "- ").replace(/[ \t]+/g, " ").trim();
    if (!text) return;
    if (BOILERPLATE.some((re) => re.test(text)) || CITATION_ONLY.test(text)) {
      repairs.push({ lineNo: idx + 1, kind: "boilerplate_removed", before: text });
      return;
    }
    let flagReason: string | undefined;
    for (const fix of SYMBOL_FIXES) {
      if (fix.re.test(text)) {
        const after = text.replace(fix.re, fix.to);
        repairs.push({ lineNo: idx + 1, kind: "symbol_repaired", before: text, after });
        text = after;
        flagReason = "A symbol was repaired. Please check it.";
      }
      fix.re.lastIndex = 0;
    }
    const key = normalize(text);
    if (key.length > 25) {
      if (seenParagraphs.has(key)) {
        repairs.push({ lineNo: idx + 1, kind: "duplicate_removed", before: text });
        return;
      }
      seenParagraphs.add(key);
    }
    kept.push({ text, confidence: clamp(r.confidence ?? 1), flagReason });
  });

  // merge hard-wrapped lines: a line that stops mid-sentence and is followed by a lowercase continuation
  const merged: typeof kept = [];
  for (const cur of kept) {
    const prev = merged[merged.length - 1];
    const prevOpen = prev && !/[.!?:;)\]]$/.test(prev.text) && !/^[-#]/.test(prev.text) && prev.text.length > 40;
    const curContinues = /^[a-z(]/.test(cur.text) && !LIST_STARTS.test(cur.text);
    if (prev && prevOpen && curContinues) {
      repairs.push({ lineNo: merged.length + 1, kind: "wrapped_merged", before: cur.text });
      prev.text = `${prev.text} ${cur.text}`;
      prev.confidence = Math.min(prev.confidence, cur.confidence);
      prev.flagReason = prev.flagReason ?? cur.flagReason;
    } else merged.push({ ...cur });
  }

  const lines = merged.map((m, i): CleanLine => {
    const low = m.confidence < FLAG_BELOW;
    return {
      lineNo: i + 1,
      text: m.text,
      confidence: m.confidence,
      ...(low || m.flagReason ? { flagged: true, flagReason: m.flagReason ?? "Hard to read. Please check this line." } : {}),
    };
  });
  return { lines, repairs };
}

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
}

/** Splits plain text into lines for cleaning. */
export function textToRawLines(text: string): RawLine[] {
  return text.split("\n").map((t) => ({ text: t }));
}
