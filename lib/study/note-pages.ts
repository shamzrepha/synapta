import { extractKineticScenesForPage, type KineticScene } from "./kinetic-parser";

export type NotePageKind = "overview" | "section" | "example" | "summary" | "check";

export interface NotePage {
  index: number;
  title: string;
  kind: NotePageKind;
  markdown: string;
  plainText: string;
  scenes: KineticScene[];
  readSeconds: number;
}

const MAX_WORDS_PER_PAGE = 185;

function cleanHeadingTitle(raw: string): string {
  return raw
    .replace(/^#{1,6}\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function classifyPageKind(title: string, index: number, totalHint: number): NotePageKind {
  const lower = title.toLowerCase();
  if (/check|quiz|test|question|recall|practice/.test(lower)) return "check";
  if (/example|worked|walkthrough|problem|calculation|demo/.test(lower)) return "example";
  if (/summary|takeaway|conclusion|recap|glance|key terms|glossary/.test(lower)) return "summary";
  if (index === 0 || (index === 0 && totalHint > 1 && /overview|intro|abstract|core/.test(lower))) {
    return "overview";
  }
  return "section";
}

/** Converts markdown + LaTeX into clean spoken prose for ReadAloud. */
export function markdownToSpeechText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$([\s\S]*?)\$\$/g, " $1 ")
    .replace(/\$([^$\n]+)\$/g, " $1 ")
    .replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1 over $2")
    .replace(/\\times/g, " times ")
    .replace(/\\cdot/g, " times ")
    .replace(/\\div/g, " divided by ")
    .replace(/\[([^\]]+)\]\(#[^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/[*_`~]/g, "")
    .replace(/[>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface RawSection {
  title: string;
  body: string;
}

/**
 * Splits markdown into atomic blocks (keeping fenced code blocks and `$$...$$` display math intact)
 * so pagination never slices in the middle of an equation or diagram.
 */
function splitAtomicBlocks(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  let inMath = false;

  const flush = () => {
    const joined = buf.join("\n").trim();
    if (joined) blocks.push(joined);
    buf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      buf.push(line);
      if (!inFence) flush();
      continue;
    }
    if (!inFence && trimmed === "$$") {
      inMath = !inMath;
      buf.push(line);
      if (!inMath) flush();
      continue;
    }
    if (!inFence && !inMath && trimmed === "") {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return blocks;
}

function splitLongSection(section: RawSection): RawSection[] {
  const words = section.body.split(/\s+/).filter(Boolean).length;
  if (words <= MAX_WORDS_PER_PAGE) return [section];

  const blocks = splitAtomicBlocks(section.body);
  if (blocks.length <= 1) return [section];

  const parts: RawSection[] = [];
  let cur: string[] = [];
  let curWords = 0;

  for (const blk of blocks) {
    const blkWords = blk.split(/\s+/).filter(Boolean).length;
    if (cur.length > 0 && curWords + blkWords > MAX_WORDS_PER_PAGE) {
      parts.push({
        title: parts.length === 0 ? section.title : `${section.title} (${parts.length + 1})`,
        body: cur.join("\n\n"),
      });
      cur = [blk];
      curWords = blkWords;
    } else {
      cur.push(blk);
      curWords += blkWords;
    }
  }
  if (cur.length > 0) {
    parts.push({
      title: parts.length === 0 ? section.title : `${section.title} (${parts.length + 1})`,
      body: cur.join("\n\n"),
    });
  }
  return parts;
}

/**
 * Turns any long study note or class lesson markdown into bite-sized flipbook pages,
 * attaching live procedural kinetic animations (`scenes`) per page.
 */
export function paginateNoteMarkdown(markdown: string, fallbackTitle = "Study Notes"): NotePage[] {
  const source = (markdown || "").trim();
  if (!source) {
    return [
      {
        index: 0,
        title: fallbackTitle,
        kind: "overview",
        markdown: "",
        plainText: "",
        scenes: [],
        readSeconds: 5,
      },
    ];
  }

  const lines = source.split(/\r?\n/);
  const rawSections: RawSection[] = [];
  let docTitle = fallbackTitle;
  let currentTitle = fallbackTitle;
  let currentLines: string[] = [];
  let inFence = false;
  let inMath = false;

  const pushCurrent = () => {
    const body = currentLines.join("\n").trim();
    if (body) rawSections.push({ title: currentTitle, body });
    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) inFence = !inFence;
    else if (!inFence && trimmed === "$$") inMath = !inMath;

    if (!inFence && !inMath) {
      const h1 = /^#\s+(.+)$/.exec(trimmed);
      if (h1 && rawSections.length === 0 && currentLines.length === 0) {
        docTitle = cleanHeadingTitle(h1[1]) || fallbackTitle;
        currentTitle = docTitle;
        currentLines.push(line);
        continue;
      }

      const h2 = /^#{1,2}\s+(.+)$/.exec(trimmed);
      if (h2) {
        pushCurrent();
        currentTitle = cleanHeadingTitle(h2[1]) || fallbackTitle;
        currentLines.push(line);
        continue;
      }

      const h3 = /^###\s+(.+)$/.exec(trimmed);
      if (h3 && currentLines.join("\n").split(/\s+/).length >= 55) {
        pushCurrent();
        currentTitle = cleanHeadingTitle(h3[1]) || currentTitle;
        currentLines.push(line);
        continue;
      }
    }

    currentLines.push(line);
  }
  pushCurrent();

  // If page 0 is just the main document H1 with almost no prose, merge it into page 1.
  if (rawSections.length >= 2) {
    const firstNonHeading = rawSections[0].body.replace(/^#[^\n]*\n?/, "").trim();
    if (firstNonHeading.length < 35) {
      rawSections[1] = {
        title: rawSections[1].title,
        body: `${rawSections[0].body}\n\n${rawSections[1].body}`.trim(),
      };
      rawSections.shift();
    }
  }

  const expanded = rawSections.flatMap((sec) => splitLongSection(sec));
  const pages = expanded.map((sec, idx) => {
    const { cleanMarkdown, scenes } = extractKineticScenesForPage(sec.body, sec.title);
    const plainText = markdownToSpeechText(cleanMarkdown);
    const wordCount = plainText ? plainText.split(/\s+/).length : 0;
    return {
      index: idx,
      title: sec.title || docTitle,
      kind: classifyPageKind(sec.title, idx, expanded.length),
      markdown: cleanMarkdown,
      plainText,
      scenes,
      readSeconds: Math.max(5, Math.ceil(wordCount / 3)),
    };
  });

  return pages.length > 0
    ? pages
    : [
        {
          index: 0,
          title: docTitle,
          kind: "overview",
          markdown: source,
          plainText: markdownToSpeechText(source),
          scenes: [],
          readSeconds: 10,
        },
      ];
}
