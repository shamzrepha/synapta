/** Study notes: structured notes made from any source (typed, scanned or photographed), refined on request, kept as versions. */

export const NOTE_SOURCE_MAX = 120_000;
export const MAX_VERSIONS = 20;

export const NOTES_SYSTEM = `You turn a student's source material into excellent study notes, the way a great tutor would write them.
Write in clean markdown with this structure:
# <Title>
> One short paragraph: what this is about and why it matters.

## <Topic 1>
### <Subtopic>
- Clear explanation in short paragraphs or bullets. Define each key term in bold the first time.
- Formulas between single dollar signs ($a^2 + b^2 = c^2$) or display maths between double dollar signs.
- **Worked example:** a full step-by-step example that uses real numbers.
(repeat for every topic and subtopic in the source; keep the source's order)

## Key terms
A short list of term: meaning.

## Common mistakes
Bullets on what students usually get wrong and how to avoid it.

## Check yourself
5 questions that test understanding, then the answers under "Answers".

## Summary
Three to five bullets.

Rules:
- Use ONLY what the source contains. If the source is thin, keep the notes short rather than inventing facts. You may add a small worked example that follows directly from a rule in the source.
- Keep page references: the source has markers like [Page 3]. After a fact, cite its page like [p.3] (several: [p.3][p.5]). Do not cite pages that don't exist.
- Never output anything before the title or after the Summary.`;

export const REFINE_SYSTEM = `You revise a student's study notes. You are given the current notes, the source they came from, and one instruction. Return the complete revised notes in the same markdown structure, with the same [p.N] page citations, and nothing else. Change only what the instruction asks for; keep everything correct and grounded in the source.`;

export const REFINE_PRESETS: Array<{ id: string; label: string; instruction: string }> = [
  { id: "simpler", label: "Simpler", instruction: "Rewrite in simpler words for a beginner. Shorter sentences, everyday analogies, define every technical term." },
  { id: "examples", label: "More examples", instruction: "Add one more worked example under each topic, using different numbers or a real-life situation." },
  { id: "exam", label: "Exam focus", instruction: "Focus on what is most likely to be examined: key definitions, formulas, standard question types, and marking-scheme style points. Trim the rest." },
  { id: "shorter", label: "Shorter", instruction: "Cut the notes to about half the length. Keep every formula and key term." },
  { id: "deeper", label: "More depth", instruction: "Go deeper: add the reasoning behind each rule and how the topics connect." },
];

export function clipSource(text: string, max = NOTE_SOURCE_MAX): string {
  const t = (text || "").trim();
  return t.length > max ? `${t.slice(0, max)}\n\n[The rest of the source was cut to fit.]` : t;
}

/** Turns "[p.3]" / "[p. 3]" / "(p. 3)" into a link the page turns into a button that opens that page of the source. */
export function linkCitations(markdown: string): string {
  return (markdown || "").replace(/(?<!\[)[[(]\s*p{1,2}\.?\s*(\d{1,4})(?:\s*[-–]\s*\d{1,4})?\s*[\])](?!\()/gi, (_m, n: string) => `[p. ${n}](#src-${n})`);
}

/** The text of one page of a source read with "[Page N]" markers; "" when it has none. */
export function sourcePage(source: string, n: number): string {
  const parts = (source || "").split(/^\[Page (\d+)\]\s*$/m);
  for (let i = 1; i < parts.length; i += 2) if (Number(parts[i]) === n) return (parts[i + 1] || "").trim();
  return "";
}

export function noteTitle(markdown: string, fallback = "Study notes"): string {
  const m = /^#\s+(.+)$/m.exec(markdown || "");
  const t = (m?.[1] || "").replace(/[*_`$]/g, "").trim();
  return t ? t.slice(0, 80) : fallback;
}

export function generatePrompt(title: string, source: string): string {
  return `Source title: ${title || "Untitled"}\n\n--- SOURCE START ---\n${clipSource(source)}\n--- SOURCE END ---\n\nWrite the study notes now.`;
}

export function refinePrompt(notes: string, source: string, instruction: string): string {
  return `Instruction: ${instruction.slice(0, 500)}\n\n--- CURRENT NOTES ---\n${notes}\n--- END NOTES ---\n\n--- SOURCE ---\n${clipSource(source, 60_000)}\n--- END SOURCE ---`;
}
