import { z } from "zod";
import type { EvidenceSummary, TopicSummary } from "./evidence";

export const TOOLS = ["retest", "flashcards", "notes", "lesson", "quiz", "tutor"] as const;
export type Tool = (typeof TOOLS)[number];

const str = (n: number) => z.string().trim().min(1).max(n);

export const evaluationSchema = z.object({
  headline: str(160),
  strengths: z.array(str(160)).max(4).default([]),
  gaps: z
    .array(
      z.object({
        topic: str(80),
        /** what the learner seems to misunderstand, in plain words, based on their wrong answers */
        misunderstanding: str(300),
        severity: z.number().int().min(1).max(3),
      })
    )
    .max(5)
    .default([]),
  plan: z
    .array(
      z.object({
        title: str(80),
        action: str(240),
        topic: z.string().trim().max(80).default(""),
        tool: z.enum(TOOLS),
        minutes: z.number().int().min(5).max(90).default(15),
      })
    )
    .min(1)
    .max(6),
  encouragement: str(200),
});
export type Evaluation = z.output<typeof evaluationSchema>;

export const EVALUATION_SYSTEM = `You are a caring, precise study coach. You are given evidence about ONE learner: the questions they got wrong (with their answer and the correct one) and their mastery score per topic (0 to 1).
Write a short evaluation as JSON:
{"headline": "...", "strengths": ["..."], "gaps": [{"topic": "...", "misunderstanding": "...", "severity": 1-3}], "plan": [{"title": "...", "action": "...", "topic": "...", "tool": "retest|flashcards|notes|lesson|quiz|tutor", "minutes": 15}], "encouragement": "..."}
Rules:
- Use ONLY the evidence. Never invent topics, scores or mistakes. If the evidence is thin, say so and keep it short.
- For each gap, compare what they answered with the correct answer and name the likely misunderstanding in plain words (for example "treats current as used up by a resistor"), not just "weak in Ohm's law".
- severity 3 = most urgent. At most 5 gaps, worst first.
- The plan has 3 to 6 steps in the order to do them. Each step names a topic from the evidence and one tool: retest (redo their wrong answers), flashcards, notes (make notes from their own material), lesson (an interactive lesson on the topic), quiz, or tutor (ask the AI tutor). Make each action specific and doable in the minutes given.
- Strengths must be real: topics with high mastery or mistakes they have already fixed.
- Warm and direct, no flattery, no generic advice like "study more".`;

export function evaluationPrompt(s: EvidenceSummary): string {
  const lines = s.topics.map((t, i) => {
    const score = t.pL === null ? "no score yet" : `mastery ${Math.round(t.pL * 100)}%`;
    const ex = t.examples.map((e) => `   - Q: ${e.question} | they answered: ${e.studentAnswer || "(blank)"} | correct: ${e.correctAnswer}`).join("\n");
    return `${i + 1}. ${t.topic}${t.classTitle ? ` (${t.classTitle})` : ""}: ${score}, ${t.openMistakes} wrong answers still open, ${t.totalWrong} wrong in total, status ${t.status}${ex ? `\n${ex}` : ""}`;
  });
  return `Evidence for this learner:\nOpen wrong answers: ${s.openMistakes}. Wrong answers already fixed: ${s.masteredMistakes}. Topics scored: ${s.topicsTracked}.\n\n${lines.join("\n")}`;
}

/** A plain, no-AI evaluation from the numbers, so the page is never empty when the AI is busy. */
export function fallbackEvaluation(s: EvidenceSummary): Evaluation {
  const weak = s.topics.filter((t) => t.status === "struggling" || t.openMistakes > 0).slice(0, 5);
  const strong = s.topics.filter((t) => t.status === "mastered").slice(0, 3);
  const plan: Evaluation["plan"] = [];
  if (s.openMistakes > 0) plan.push({ title: "Redo your wrong answers", action: `Retest the ${s.openMistakes} question${s.openMistakes === 1 ? "" : "s"} you missed until they stick.`, topic: weak[0]?.topic ?? "", tool: "retest", minutes: 15 });
  for (const t of weak.slice(0, 3)) plan.push({ title: `Strengthen ${t.topic}`, action: `Open an interactive lesson on ${t.topic}, then check yourself with a short quiz.`, topic: t.topic, tool: "lesson", minutes: 20 });
  if (plan.length === 0) plan.push({ title: "Keep going", action: "Take a quiz on your next topic to find your next gap.", topic: "", tool: "quiz", minutes: 15 });
  return {
    headline: weak.length ? `${weak[0].topic} needs the most work right now.` : "You're on track so far.",
    strengths: strong.map((t) => `${t.topic} is solid.`),
    gaps: weak.map((t) => ({ topic: t.topic, misunderstanding: `${t.openMistakes || t.totalWrong} wrong answer${(t.openMistakes || t.totalWrong) === 1 ? "" : "s"}${t.pL !== null ? ` and mastery at ${Math.round(t.pL * 100)}%` : ""}. Review what you got wrong here.`, severity: t.status === "struggling" ? 3 : 2 })),
    plan: plan.slice(0, 6),
    encouragement: "Every wrong answer you fix is a gap closed. Start with the first step.",
  };
}

/** Where each plan step should send the learner. Topic links come only from topics we know, never from the AI. */
export function linkFor(tool: Tool, topic: string, topics: TopicSummary[]): string {
  const t = topics.find((x) => x.topic.toLowerCase() === topic.trim().toLowerCase());
  const topicPage = t?.classId && t.kcId ? `/classes/${t.classId}/topics/${t.kcId}` : null;
  switch (tool) {
    case "retest":
      return "/study/mistakes";
    case "flashcards":
      return "/study/flashcards";
    case "notes":
      return "/study/notes";
    case "tutor":
      return t?.classId && t.kcId ? `/tutor?class=${t.classId}&topic=${t.kcId}` : "/tutor";
    case "lesson":
      return topicPage ? `${topicPage}?tab=teach` : "/study/notes";
    case "quiz":
      return topicPage ? `${topicPage}?tab=quiz` : "/classes/manage";
  }
}
