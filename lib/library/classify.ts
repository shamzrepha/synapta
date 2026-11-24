/**
 * Works out what an uploaded file is from its NAME and size alone, so the content is never read (and no AI tokens are spent)
 * unless the name is not enough. A 1,000-page textbook is filed as a textbook and left unread until a student opens it.
 */
export type FileKind = "textbook" | "lecture_note" | "slides" | "past_question" | "other";

export interface Classified {
  kind: FileKind;
  title: string;
  /** e.g. "MCE 302" */
  courseCode: string | null;
  /** 100..600 from a course code like MCE 302, or null */
  level: number | null;
  /** 0..1: below about 0.6 the name was not enough and an AI look at the name (still not the content) is worth a call */
  confidence: number;
  /** how the library should treat it: read it whole, or only index it (contents, headings) until a student opens it */
  readPolicy: "full" | "index_only";
  reasons: string[];
}

export const INDEX_ONLY_PAGES = 120;

const CODE = /\b([A-Za-z]{2,4})[\s_-]?(\d{3})\b/;

export function titleFromName(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Untitled";
}

export function classifyFile(i: { fileName: string; pages?: number | null; sizeBytes?: number; mime?: string }): Classified {
  const name = i.fileName;
  const reasons: string[] = [];
  const pages = typeof i.pages === "number" && i.pages > 0 ? i.pages : null;
  const m = CODE.exec(name);
  const courseCode = m ? `${m[1].toUpperCase()} ${m[2]}` : null;
  const level = m ? Math.min(600, Math.max(100, Number(m[2][0]) * 100)) : null;
  if (courseCode) reasons.push(`course code ${courseCode}`);

  let kind: FileKind = "other";
  let confidence = 0.35;
  const isSlides = /\.pptx?$/i.test(name) || /powerpoint|presentation/i.test(i.mime || "");
  if (/past[\s_-]*(question|paper)|\bpq\b|exam[\s_-]*(paper|question)|\b(20\d\d)[\s_/-]*(exam|test)|test[\s_-]*question/i.test(name)) {
    kind = "past_question"; confidence = 0.85; reasons.push("name says past questions or an exam");
  } else if (isSlides) {
    kind = "slides"; confidence = 0.8; reasons.push("a slide file");
  } else if (/textbook|e[\s_-]?book|\bedition\b|\bed\.?\s*\d|handbook|principles of|fundamentals of|introduction to|engineering mechanics|\bvol(ume)?\b/i.test(name) && (pages === null || pages > 100)) {
    kind = "textbook"; confidence = pages && pages > 150 ? 0.9 : 0.7; reasons.push("name reads like a textbook");
  } else if (/lecture|notes?|handout|summary|module|chapter|week[\s_-]*\d|slides?/i.test(name)) {
    kind = "lecture_note"; confidence = 0.75; reasons.push("name says lecture notes or a handout");
  } else if (pages && pages >= 250) {
    kind = "textbook"; confidence = 0.65; reasons.push(`${pages} pages is book length`);
  } else if (pages && pages <= 60 && courseCode) {
    kind = "lecture_note"; confidence = 0.6; reasons.push("short, with a course code");
  }
  const readPolicy: Classified["readPolicy"] = kind === "textbook" || (pages !== null && pages > INDEX_ONLY_PAGES) ? "index_only" : "full";
  if (readPolicy === "index_only") reasons.push(`long file: index only until opened`);
  return { kind, title: titleFromName(name), courseCode, level, confidence, readPolicy, reasons };
}
