/** Where a topic sits in the class's topic tree, and how the AI is told to write it as a textbook chapter. */

export interface TreeKc {
  id: string;
  title: string;
  order?: number;
  parentId?: string | null;
}

export interface Place {
  /** outline number such as "3", "3.2" or "3.2.1" */
  number: string;
  depth: number;
  /** titles from the top of the tree down to (not including) this topic */
  ancestors: string[];
  /** the topic's direct sub-topics, in order */
  children: Array<{ id: string; title: string; number: string }>;
  /** sibling topics at the same level (excluding this one) */
  siblings: string[];
}

/** Numbers every topic like a textbook's contents (1, 1.1, 1.1.1) following parent links and the topics' order. */
export function placeInTree(kcs: TreeKc[], kcId: string): Place | null {
  const ids = new Set(kcs.map((k) => k.id));
  const byOrder = (a: TreeKc, b: TreeKc) => (a.order ?? 0) - (b.order ?? 0);
  const kids = new Map<string, TreeKc[]>();
  const roots: TreeKc[] = [];
  for (const k of kcs) {
    if (k.parentId && ids.has(k.parentId) && k.parentId !== k.id) kids.set(k.parentId, [...(kids.get(k.parentId) || []), k]);
    else roots.push(k);
  }
  roots.sort(byOrder);
  for (const l of kids.values()) l.sort(byOrder);

  let found: Place | null = null;
  const seen = new Set<string>();
  const walk = (list: TreeKc[], prefix: string, ancestors: string[]) => {
    list.forEach((k, i) => {
      if (seen.has(k.id)) return;
      seen.add(k.id);
      const number = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const children = kids.get(k.id) || [];
      if (k.id === kcId) {
        found = {
          number,
          depth: number.split(".").length - 1,
          ancestors,
          children: children.map((c, j) => ({ id: c.id, title: c.title, number: `${number}.${j + 1}` })),
          siblings: list.filter((x) => x.id !== k.id).map((x) => x.title),
        };
      }
      walk(children, number, [...ancestors, k.title]);
    });
  };
  walk(roots, "", []);
  return found;
}

export const TEXTBOOK_STYLE = "textbook-v1";

/**
 * The system prompt for one topic's lesson. A topic with sub-topics is the chapter introduction (the sub-topics carry the
 * detail); a topic without is a full textbook section. Headings are numbered like a textbook and use plain section names
 * so the reader can build pages and labels from them.
 */
export function textbookSystemPrompt(p: {
  classTitle: string;
  subject: string;
  level: string;
  kcTitle: string;
  place: Place | null;
  objectives: string[];
  design: string;
}): string {
  const n = p.place?.number || "1";
  const kids = p.place?.children || [];
  const isIntro = kids.length > 0;
  const where = p.place && p.place.ancestors.length > 0 ? `It sits under: ${p.place.ancestors.join(" > ")}.` : "It is a top-level chapter.";
  const length = isIntro
    ? "900 to 1,500 words: this is the chapter introduction, so give the big picture, how the parts relate and when to use which, and do NOT repeat what the sub-topics teach in detail"
    : "2,400 to 4,000 words: this is a full textbook section, so be thorough, concrete and complete";
  const structure = isIntro
    ? `## ${n}.1 Overview
## ${n}.2 The big picture  (how the sub-topics fit together; include a comparison table of them)
## ${n}.3 What this chapter covers  (one short paragraph per sub-topic, in order: ${kids.map((k) => `${k.number} ${k.title}`).join("; ")})
## ${n}.4 Choosing between them / how they work together  (real decisions, trade-offs)
## ${n}.5 Chapter summary
## ${n}.6 Key terms
## ${n}.7 Review questions`
    : `## ${n}.1 Overview  (why it matters, with a real-world hook; what you will learn)
## ${n}.2 ... ## ${n}.N  Five to eight main sections that teach the topic in the order a textbook would: definitions and principles first, then construction/mechanism, then behaviour, variants and types, applications, limits and selection, safety or good practice where relevant.
   Inside each main section use ### ${n}.x.y sub-sections, and #### ${n}.x.y.z where a sub-section needs splitting (types, steps, cases).
## ${n}.N+1 Worked example  (at least two fully worked, step-by-step examples; for quantitative topics use numbers and units)
## ${n}.N+2 Common mistakes  (3 to 5 misconceptions and how to avoid them)
## ${n}.N+3 Chapter summary  (8 to 12 bullet takeaways)
## ${n}.N+4 Key terms  (a glossary as a bullet list: **term**: meaning)
## ${n}.N+5 Review questions  (6 to 8 questions of mixed difficulty, then a final line starting with **Answers:** answering them briefly)`;
  return `You are an expert author writing one chapter of a real university-grade textbook for the course "${p.classTitle}" (${p.subject}). Audience level: ${p.level}.
This chapter is "${p.kcTitle}" and its number is ${n}. ${where}${p.place && p.place.siblings.length > 0 ? ` Neighbouring topics (do not drift onto them): ${p.place.siblings.slice(0, 8).join(", ")}.` : ""}

Write it the way a published textbook does: complete, well structured, authoritative, in GitHub-flavoured Markdown. Length: ${length}.

Use exactly this skeleton of "##" headings, each beginning with its number:
${structure}

Style rules:
- Do not start with a "#" title (the page shows the chapter name). Begin straight with the first ## heading.
- Explain in full paragraphs that build from simple to advanced, like a textbook, not in terse bullets. Use bullets only for lists, steps and takeaways.
- Put a one-line definition in a blockquote the first time an important term appears: > **Definition.** ...
- Use tables for comparisons (types, specifications, pros and cons), and numbered lists for procedures.
- **Bold** every key term the first time it is introduced (the reader turns bold and technical words into tap-for-more highlights).
- Write all maths in LaTeX ($...$ inline, $$...$$ display).
- Stay accurate. Ground the chapter in the provided material (the teacher's uploads) and add standard, correct textbook knowledge where the material is thin; never invent facts, figures or sources.
- Learning objectives to cover: ${p.objectives.length ? p.objectives.map((o) => o.replace(/^\[[^\]]+\]\s*/, "")).join(" | ") : "(derive them from the topic)"}.

${p.design}

Output Markdown only, no raw HTML, no code fences around the whole answer.`;
}
