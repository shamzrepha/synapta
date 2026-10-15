import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { sanitizeUntrustedPromptText } from "@/lib/ai/scrub";

export interface KcGroundingContext {
  kcTitle: string;
  description: string;
  objectives: string[];
  classTitle: string;
  subject: string;
  level: string;
  lessonMarkdown: string;
  /** Lesson + objectives + relevant uploaded-material excerpts, ready to drop into a prompt. */
  contextText: string;
  kcData: FirebaseFirestore.DocumentData;
}

/**
 * Picks the parts of a long document most relevant to a topic: paragraphs that mention the
 * topic's keywords score highest, so a 300-page PDF still yields on-topic grounding.
 */
export function selectRelevantExcerpt(text: string, keywords: string[], budget: number): string {
  if (!text) return "";
  if (text.length <= budget) return text;
  const kws = keywords
    .flatMap((k) => k.toLowerCase().split(/[^a-z0-9]+/))
    .filter((w) => w.length > 3);
  const paragraphs = text.split(/\n\s*\n|(?<=\.)\s{2,}/).filter((p) => p.trim().length > 40);
  if (kws.length === 0 || paragraphs.length === 0) return text.slice(0, budget);

  const scored = paragraphs.map((p, idx) => {
    const lower = p.toLowerCase();
    let score = 0;
    for (const w of kws) {
      if (lower.includes(w)) score += 1;
    }
    return { idx, p, score };
  });
  const picked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  const chosen: typeof picked = [];
  let used = 0;
  for (const s of picked) {
    if (used + s.p.length > budget) continue;
    chosen.push(s);
    used += s.p.length;
  }
  if (chosen.length === 0) return text.slice(0, budget);
  // Keep original document order so the excerpt reads naturally
  return chosen
    .sort((a, b) => a.idx - b.idx)
    .map((s) => s.p.trim())
    .join("\n\n");
}

/**
 * Loads everything the AI needs to stay grounded in a topic: the lesson, objectives and the most
 * relevant excerpts from the class's uploaded materials (always, not only when the lesson is short).
 */
export async function loadKcGroundingContext(
  classId: string,
  kcId: string,
  opts: { materialBudget?: number } = {}
): Promise<KcGroundingContext> {
  const materialBudget = opts.materialBudget ?? 8000;
  const classRef = adminDb().collection("classes").doc(classId);
  const [classDoc, kcDoc] = await Promise.all([
    classRef.get(),
    classRef.collection("kcs").doc(kcId).get(),
  ]);
  if (!kcDoc.exists) {
    throw new ApiError(404, "NOT_FOUND", "Topic not found");
  }
  const classData = classDoc.data() || {};
  const kcData = kcDoc.data()!;
  const kcTitle: string = kcData.title || "Topic";
  const description: string = kcData.description || "";
  const objectives: string[] = Array.isArray(kcData.objectives) ? kcData.objectives : [];
  const lessonMarkdown: string = kcData.lessonMarkdown || "";

  // Prefer the materials this topic was derived from; otherwise fall back to the class library.
  const sourceIds: string[] = Array.isArray(kcData.sourceMaterialIds) ? kcData.sourceMaterialIds.slice(0, 5) : [];
  let materialDocs: Array<{ title?: string; fileName?: string; extractedText?: string }> = [];
  try {
    if (sourceIds.length > 0) {
      const snaps = await Promise.all(sourceIds.map((id) => classRef.collection("materials").doc(id).get()));
      materialDocs = snaps.filter((s) => s.exists).map((s) => s.data() as typeof materialDocs[number]);
    }
    if (materialDocs.length === 0) {
      const snap = await classRef.collection("materials").limit(5).get();
      materialDocs = snap.docs.map((d) => d.data() as typeof materialDocs[number]);
    }
  } catch {
    materialDocs = [];
  }

  const withText = materialDocs.filter((m) => typeof m.extractedText === "string" && m.extractedText.length > 0);
  const perDoc = withText.length > 0 ? Math.floor(materialBudget / withText.length) : 0;
  const keywords = [kcTitle, ...objectives.map((o) => o.replace(/^\[[^\]]+\]\s*/, ""))];
  const excerpts = withText
    .map((m) => {
      const excerpt = selectRelevantExcerpt(m.extractedText as string, keywords, perDoc);
      return `--- From "${m.title || m.fileName || "class material"}" ---\n${excerpt}`;
    })
    .join("\n\n");

  const contextText = sanitizeUntrustedPromptText(
    [
      `Topic: ${kcTitle}`,
      description ? `Description: ${description}` : "",
      objectives.length > 0 ? `Learning objectives:\n${objectives.map((o) => `- ${o}`).join("\n")}` : "",
      lessonMarkdown ? `Lesson notes:\n${lessonMarkdown}` : "",
      excerpts ? `Reference excerpts from the teacher's uploaded materials:\n${excerpts}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    30000
  );

  return {
    kcTitle,
    description,
    objectives,
    classTitle: classData.title || "",
    subject: classData.subject || "",
    level: classData.level || "undergrad",
    lessonMarkdown,
    contextText,
    kcData,
  };
}
