import { adminDb } from "@/lib/firebase/admin";
import { isPublished } from "@/lib/classes/published";
import { daysBetween } from "@/lib/exams/schedule";
import { isDueStored, type StoredFsrs } from "@/lib/flashcards/serde";
import type { Candidate } from "./rank";

/**
 * Builds the pool the ranker chooses from. ONLY content this learner is allowed to see:
 *  - topics of classes they are actively enrolled in, and only the parts the lecturer has PUBLISHED (isPublished)
 *  - their own flashcards and their own notes
 * Reads are bounded (a handful of classes, a capped number of topics) so a feed request stays cheap.
 */
export interface FeedTopic {
  classId: string;
  kcId: string;
  title: string;
  /** the kc document, only used for its publish map */
  kc: object;
}
export interface FeedMastery {
  pL: number;
  /** ms epoch of the next scheduled review, if any */
  reviewAtMs: number | null;
}
export interface FeedInputs {
  today: string;
  nowMs: number;
  topics: FeedTopic[];
  mastery: Record<string, FeedMastery>; // key `${classId}:${kcId}`
  exams: Array<{ date: string; classIds: string[] }>;
  dueCards: number;
  notes: Array<{ id: string; title: string }>;
}

const MAX_CANDIDATES = 120;
const mk = (classId: string, kcId: string) => `${classId}:${kcId}`;

export function candidatesFrom(i: FeedInputs): Candidate[] {
  const out: Candidate[] = [];
  if (i.dueCards > 0) {
    out.push({ id: "cards:due", kind: "due_cards", format: "flashcards", title: `${i.dueCards} flashcard${i.dueCards === 1 ? "" : "s"} to review`, href: "/study/flashcards", minutes: Math.max(3, Math.min(10, Math.round(i.dueCards / 3))), mastery: null, dueDays: 0, examDays: null, count: i.dueCards });
  }
  for (const t of i.topics) {
    const m = i.mastery[mk(t.classId, t.kcId)];
    const mastery = m ? m.pL : null;
    const dueDays = m?.reviewAtMs ? Math.round((m.reviewAtMs - i.nowMs) / 86_400_000) : null;
    const examDays =
      i.exams
        .filter((e) => e.classIds.includes(t.classId))
        .map((e) => daysBetween(i.today, e.date))
        .filter((d) => d >= 0)
        .sort((a, b) => a - b)[0] ?? null;
    const base = { mastery, dueDays, examDays, topicId: mk(t.classId, t.kcId), topicTitle: t.title };
    const topicHref = `/classes/${t.classId}/topics/${t.kcId}`;
    const id = (kind: string) => `${kind}:${mk(t.classId, t.kcId)}`;
    if (isPublished(t.kc, "lesson")) {
      out.push({ ...base, id: id("lesson"), kind: mastery !== null && mastery < 0.4 ? "weak_topic" : "lesson", format: "lesson", title: `Read: ${t.title}`, href: topicHref, minutes: 8 });
      out.push({ ...base, id: id("written"), kind: "written", format: "written", title: `Written practice: ${t.title}`, href: `/practice/written?classId=${t.classId}&kcId=${t.kcId}&title=${encodeURIComponent(t.title)}`, minutes: 8 });
    }
    if (isPublished(t.kc, "practice")) {
      out.push({ ...base, id: id("quiz"), kind: "quiz", format: "quiz", title: `Quiz: ${t.title}`, href: topicHref, minutes: 5 });
    }
    if (isPublished(t.kc, "simulation")) {
      out.push({ ...base, id: id("lab"), kind: "lab", format: "lab", title: `Try it: ${t.title}`, href: `${topicHref}?tab=build`, minutes: 10 });
    }
    if (isPublished(t.kc, "audio")) {
      out.push({ ...base, id: id("podcast"), kind: "podcast", format: "podcast", title: `Listen: ${t.title}`, href: topicHref, minutes: 6 });
    }
  }
  for (const n of i.notes.slice(0, 5)) {
    // a learner's own notes are a light, optional item: known material, so modest need
    out.push({ id: `note:${n.id}`, kind: "lesson", format: "lesson", title: `Re-read your notes: ${n.title}`, href: "/study/notes", minutes: 5, mastery: 0.7, dueDays: null, examDays: null });
  }
  return out.slice(0, MAX_CANDIDATES);
}

const ms = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | string | null | undefined;
  if (!t) return null;
  if (typeof t === "object" && typeof t.toMillis === "function") return t.toMillis();
  const p = typeof t === "string" ? Date.parse(t) : NaN;
  return Number.isNaN(p) ? null : p;
};

export async function loadFeedInputs(uid: string, today: string, nowMs = Date.now()): Promise<FeedInputs> {
  const db = adminDb();
  const [enr, masterySnap, examSnap, cardSnap, noteSnap] = await Promise.all([
    db.collection("enrollments").where("uid", "==", uid).where("status", "==", "active").limit(8).get(),
    db.collection("mastery").where("uid", "==", uid).limit(150).get(),
    db.collection("examPlans").where("uid", "==", uid).limit(10).get(),
    db.collection("flashcards").where("uid", "==", uid).limit(500).get(),
    db.collection("studyNotes").where("uid", "==", uid).limit(5).get(),
  ]);
  const classIds = Array.from(new Set(enr.docs.map((d) => String(d.data().classId || "")).filter(Boolean))).slice(0, 5);
  const kcSnaps = await Promise.all(classIds.map((c) => db.collection("classes").doc(c).collection("kcs").limit(25).get()));
  const topics: FeedTopic[] = [];
  kcSnaps.forEach((snap, idx) => {
    for (const d of snap.docs) {
      const data = d.data();
      const title = String(data.title || "").trim();
      if (title) topics.push({ classId: classIds[idx], kcId: d.id, title: title.slice(0, 80), kc: data });
    }
  });
  const mastery: FeedInputs["mastery"] = {};
  for (const d of masterySnap.docs) {
    const x = d.data();
    if (typeof x.classId === "string" && typeof x.kcId === "string" && typeof x.pL === "number") mastery[mk(x.classId, x.kcId)] = { pL: x.pL, reviewAtMs: ms(x.nextReviewAt) };
  }
  const exams = examSnap.docs
    .map((d) => d.data())
    .filter((x) => typeof x.examDate === "string")
    .map((x) => ({ date: String(x.examDate), classIds: Array.isArray(x.classIds) ? x.classIds.map(String) : [] }));
  const now = new Date(nowMs);
  const dueCards = cardSnap.docs.filter((d) => isDueStored(d.data().fsrs as StoredFsrs | undefined, now)).length;
  const notes = noteSnap.docs.map((d) => ({ id: d.id, title: String(d.data().title || "Untitled").slice(0, 60) }));
  return { today, nowMs, topics, mastery, exams, dueCards, notes };
}
