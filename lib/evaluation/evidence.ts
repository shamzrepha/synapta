import { isMastered, isStruggling } from "@/lib/bkt/engine";

/** What the evaluation is based on: only things the learner actually did. */
export interface MistakeEvidence {
  topic: string;
  classId: string | null;
  kcId: string | null;
  classTitle: string;
  question: string;
  studentAnswer: string;
  correctAnswer: string;
  wrongCount: number;
  mastered: boolean;
}
export interface MasteryEvidence {
  title: string;
  classId: string | null;
  kcId: string;
  classTitle: string;
  pL: number;
}

export interface TopicSummary {
  topic: string;
  classId: string | null;
  kcId: string | null;
  classTitle: string;
  openMistakes: number;
  totalWrong: number;
  pL: number | null;
  status: "mastered" | "improving" | "struggling" | "unknown";
  /** the actual wrong answers behind it (kept short), so the evaluation can name the misconception */
  examples: Array<{ question: string; studentAnswer: string; correctAnswer: string }>;
}

export interface EvidenceSummary {
  topics: TopicSummary[];
  openMistakes: number;
  masteredMistakes: number;
  topicsTracked: number;
}

const clip = (s: string, n: number) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
const keyOf = (topic: string, kcId: string | null) => (kcId ? `kc:${kcId}` : `t:${topic.toLowerCase()}`);

/** Joins wrong answers and mastery scores into one list per topic, weakest first. */
export function summarize(mistakes: MistakeEvidence[], mastery: MasteryEvidence[]): EvidenceSummary {
  const map = new Map<string, TopicSummary>();
  const get = (topic: string, classId: string | null, kcId: string | null, classTitle: string) => {
    const k = keyOf(topic, kcId);
    let t = map.get(k);
    if (!t) {
      t = { topic: topic || "General", classId, kcId, classTitle, openMistakes: 0, totalWrong: 0, pL: null, status: "unknown", examples: [] };
      map.set(k, t);
    }
    return t;
  };
  for (const m of mastery) {
    const t = get(m.title, m.classId, m.kcId, m.classTitle);
    t.pL = m.pL;
  }
  for (const m of mistakes) {
    const t = get(m.topic, m.classId, m.kcId, m.classTitle);
    t.totalWrong += Math.max(1, m.wrongCount);
    if (!m.mastered) {
      t.openMistakes += 1;
      if (t.examples.length < 3) t.examples.push({ question: clip(m.question, 160), studentAnswer: clip(m.studentAnswer, 100), correctAnswer: clip(m.correctAnswer, 100) });
    }
  }
  const topics = [...map.values()].map((t) => {
    const status: TopicSummary["status"] = t.pL === null ? (t.openMistakes > 0 ? "struggling" : "unknown") : isMastered(t.pL) && t.openMistakes === 0 ? "mastered" : isStruggling(t.pL) || t.openMistakes >= 2 ? "struggling" : "improving";
    return { ...t, status };
  });
  const weakness = (t: TopicSummary) => t.openMistakes * 3 + t.totalWrong + (t.pL === null ? 0 : (1 - t.pL) * 4);
  topics.sort((a, b) => weakness(b) - weakness(a));
  return {
    topics: topics.slice(0, 12),
    openMistakes: mistakes.filter((m) => !m.mastered).length,
    masteredMistakes: mistakes.filter((m) => m.mastered).length,
    topicsTracked: mastery.length,
  };
}

/** Too little to say anything honest: nothing wrong yet and no scores. */
export function hasEnoughEvidence(s: EvidenceSummary): boolean {
  return s.topics.length > 0 && (s.openMistakes > 0 || s.topicsTracked > 0 || s.masteredMistakes > 0);
}
