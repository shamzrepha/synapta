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
  /** Titles of the class's other topics: the AI must not drift onto these. */
  otherTopics: string[];
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
  const [classDoc, kcDoc, allKcs] = await Promise.all([
    classRef.get(),
    classRef.collection("kcs").doc(kcId).get(),
    classRef.collection("kcs").orderBy("order", "asc").limit(80).get().catch(() => null),
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
    otherTopics: (allKcs?.docs || []).filter((d) => d.id !== kcId).map((d) => String(d.data().title || "")).filter(Boolean),
    contextText,
    kcData,
  };
}

/**
 * Hard scope for anything generated for ONE subtopic (simulation ideas, simulations): it must teach
 * exactly this subtopic — not the parent topic, siblings, prerequisites or the wider course.
 */
export function scopeRule(params: { kcTitle: string; objectives: string[]; otherTopics: string[] }): string {
  const others = params.otherTopics.slice(0, 40);
  return `SCOPE — THIS IS THE MOST IMPORTANT RULE:
Everything you produce must teach ONLY the subtopic "${params.kcTitle}"${params.objectives.length ? ` and its learning objectives:\n${params.objectives.map((o) => `  - ${o.replace(/^\[[^\]]+\]\s*/, "")}`).join("\n")}` : ""}.
- Do NOT cover the parent topic, the wider course, prerequisites, or any other topic of this class. The reference material may contain content about other topics: IGNORE it unless it is about "${params.kcTitle}" itself.
- A learner should finish this activity able to do exactly what the objectives above say, nothing broader.${others.length ? `\n- Other topics in this class (they have their own simulations — do NOT teach or build on them): ${others.join("; ")}.` : ""}`;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);

/**
 * Drops ideas that are really about another topic: they name another topic of the class but none of
 * this subtopic's own keywords. (Keeps everything if that would leave nothing.)
 */
export function dropOffTopicIdeas<T extends { title: string; pitch?: string; learningGoal?: string; howItWorks?: string; challenge?: string }>(ideas: T[], kcTitle: string, otherTopics: string[]): T[] {
  const self = words(kcTitle);
  const others = otherTopics.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 3 && !kcTitle.toLowerCase().includes(t) && !t.includes(kcTitle.toLowerCase()));
  if (self.length === 0 || others.length === 0) return ideas;
  const kept = ideas.filter((i) => {
    const focus = `${i.title} ${i.learningGoal || ""}`.toLowerCase();
    const mentionsSelf = self.some((w) => focus.includes(w.slice(0, Math.max(4, w.length - 2))));
    const mentionsOther = others.some((t) => focus.includes(t));
    return mentionsSelf || !mentionsOther;
  });
  return kept.length > 0 ? kept : ideas;
}
