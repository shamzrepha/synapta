/**
 * What Home recommends, and why. Pure rules so every state is testable without a browser.
 * Order: an exam that is close, then reviews that are due, then mistakes to relearn, then the next topic, then adding material.
 * Every step carries a plain reason. Nothing here is invented: callers pass only numbers that came from saved data.
 */

export interface NextStepInput {
  /** flashcards due today */
  dueCards: number;
  /** open (not yet mastered) mistakes */
  openMistakes: number;
  /** the nearest exam plan, if any */
  exam?: { name: string; daysLeft: number } | null;
  /** the first topic that is not yet solid (from pickNextAction), with its classId */
  topic?: { classId: string; kcId: string; title: string; pct: number; kind: "continue" | "review" } | null;
  classCount: number;
}

export interface Step {
  id: "review" | "mistakes" | "topic" | "exam" | "add" | "tutor" | "practise";
  title: string;
  /** one short sentence: why this, in plain words */
  reason: string;
  cta: string;
  href: string;
}

export interface NextStep {
  main: Step;
  others: Step[];
  /** set when an exam is close, so Home can lead with the countdown */
  examNote: string | null;
}

export const EXAM_NEAR_DAYS = 14;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function examNote(exam: NextStepInput["exam"]): string | null {
  if (!exam || exam.daysLeft < 0 || exam.daysLeft > EXAM_NEAR_DAYS) return null;
  if (exam.daysLeft === 0) return `${exam.name} is today.`;
  return `${exam.name} is in ${plural(exam.daysLeft, "day", "days")}.`;
}

export function pickNextStep(i: NextStepInput): NextStep {
  const examNear = !!i.exam && i.exam.daysLeft >= 0 && i.exam.daysLeft <= EXAM_NEAR_DAYS;
  const steps: Step[] = [];

  if (i.dueCards > 0) {
    steps.push({
      id: "review",
      title: `Review ${plural(i.dueCards, "card", "cards")}`,
      reason: examNear ? "These are due now, and reviewing on time is what makes them stick before the exam." : "These were scheduled for today. A short review now keeps them from fading.",
      cta: "Start review",
      href: "/study/flashcards",
    });
  }
  if (i.openMistakes > 0) {
    steps.push({
      id: "mistakes",
      title: `Relearn ${plural(i.openMistakes, "question", "questions")} you missed`,
      reason: "You got these wrong. Look at the topic again, then try fresh questions on it.",
      cta: "Open my mistakes",
      href: "/study/mistakes",
    });
  }
  if (i.topic) {
    steps.push({
      id: "topic",
      title: `${i.topic.kind === "review" ? "Review" : i.topic.pct > 0 ? "Continue" : "Start"}: ${i.topic.title}`,
      reason:
        i.topic.kind === "review"
          ? `Every topic is solid, and this is your weakest at ${i.topic.pct}%.`
          : i.topic.pct > 0
            ? `You are at ${i.topic.pct}% on this topic, the next one that is not yet solid.`
            : "This is the next topic in your class.",
      cta: i.topic.kind === "review" ? "Review it" : "Open topic",
      href: `/classes/${i.topic.classId}/topics/${i.topic.kcId}`,
    });
  }
  if (i.classCount > 0 || steps.length === 0) {
    steps.push({ id: "practise", title: "Practise some questions", reason: "Answering from memory teaches more than re-reading.", cta: "Start practice", href: "/study/daily" });
  }
  steps.push({ id: "add", title: "Add material", reason: "Upload notes, a PDF or a photo and get a lesson and practice from it.", cta: "Add material", href: "/study/notes" });
  steps.push({ id: "tutor", title: "Ask the tutor", reason: "Stuck on something? Ask in your own words.", cta: "Ask", href: "/tutor" });

  // a brand-new student with nothing yet: adding material leads
  if (i.classCount === 0 && !i.topic && i.dueCards === 0 && i.openMistakes === 0) {
    const add = steps.findIndex((s) => s.id === "add");
    const [a] = steps.splice(add, 1);
    steps.unshift(a);
  }

  const [main, ...rest] = steps;
  return { main, others: rest.slice(0, 3), examNote: examNote(i.exam) };
}
