import { z } from "zod";

/**
 * What a key-word pop-up shows above its text, decided by the AI per word instead of always fetching a picture:
 *  - "formula": the word is (or is best shown as) an equation or law, shown large;
 *  - "photo": a concrete physical thing worth seeing (a component, an instrument, an organ, a specimen);
 *  - "diagram": something best understood from a labelled schematic or cross-section;
 *  - "none": an idea, process, definition or name, where a picture would only be decoration.
 */
export const VISUAL_KINDS = ["photo", "diagram", "formula", "none"] as const;
export type VisualKind = (typeof VISUAL_KINDS)[number];

export const visualFields = {
  visual: z.enum(VISUAL_KINDS).catch("none"),
  /** LaTeX for a "formula" card, one line, without $ signs */
  formula: z.string().trim().max(200).catch(""),
};

/** The rules the AI is given, shared by the prepared-cards and live pop-up prompts. */
export const VISUAL_RULES = `"visual": choose what the pop-up shows above the text.
 - "formula" when the term IS or is best shown as an equation, law, identity or unit relationship. Put it in "formula" as one line of LaTeX without $ signs (for example a^2 + b^2 = c^2).
 - "photo" only for a concrete physical thing you could photograph and a learner has never seen (a component, an instrument, an organ, a specimen, a machine).
 - "diagram" only for something best understood from a labelled schematic or cross-section (a circuit symbol, a cell, a pathway, a structure).
 - "none" for ideas, processes, definitions, comparisons, names and anything abstract. When unsure choose "none". A picture that only decorates is worse than none; about one card in three should have a picture or formula at most.
"imageQuery" and "wikipediaTitle" only for "photo" or "diagram" (otherwise "").`;

/** Makes a card consistent: a formula card needs a formula, a picture card needs something to search for. */
export function settleVisual<T extends { visual: VisualKind; formula: string; imageQuery: string; wikipediaTitle?: string }>(c: T): T {
  const formula = c.formula.replace(/^\$+|\$+$/g, "").trim();
  if (c.visual === "formula") return formula.length >= 3 ? { ...c, formula, imageQuery: "", wikipediaTitle: "" } : { ...c, visual: "none" as const, formula: "" };
  if ((c.visual === "photo" || c.visual === "diagram") && (c.imageQuery || c.wikipediaTitle)) return { ...c, formula: "" };
  return { ...c, visual: "none" as const, formula: "", imageQuery: "", wikipediaTitle: "" };
}
