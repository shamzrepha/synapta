import { describe, it, expect } from "vitest";
import { hasEnoughEvidence, summarize, type MistakeEvidence, type MasteryEvidence } from "./evidence";
import { evaluationPrompt, evaluationSchema, fallbackEvaluation, linkFor } from "./evaluate";
import { evidenceSignature } from "./signature";
import { taskGroup } from "@/lib/ai/models";
import { AI_TASK_DEFINITIONS } from "@/lib/ai/tasks";

const mistake = (over: Partial<MistakeEvidence> = {}): MistakeEvidence => ({ topic: "Ohm's law", classId: "c1", kcId: "k1", classTitle: "Physics", question: "What is V when I=2A, R=3 ohm?", studentAnswer: "1.5 V", correctAnswer: "6 V", wrongCount: 2, mastered: false, ...over });
const mastery = (over: Partial<MasteryEvidence> = {}): MasteryEvidence => ({ title: "Ohm's law", classId: "c1", kcId: "k1", classTitle: "Physics", pL: 0.3, ...over });

describe("evaluation evidence", () => {
  it("joins wrong answers and mastery per topic, weakest first", () => {
    const s = summarize(
      [mistake(), mistake({ question: "q2", wrongCount: 1 }), mistake({ topic: "Series circuits", kcId: "k2", wrongCount: 1 })],
      [mastery(), mastery({ title: "Series circuits", kcId: "k2", pL: 0.9 }), mastery({ title: "Vectors", kcId: "k3", pL: 0.97 })]
    );
    expect(s.topics[0].topic).toBe("Ohm's law");
    expect(s.topics[0]).toMatchObject({ openMistakes: 2, totalWrong: 3, status: "struggling" });
    expect(s.topics.find((t) => t.topic === "Vectors")?.status).toBe("mastered");
    expect(s.openMistakes).toBe(3);
  });
  it("keeps the real wrong answers as examples, a few per topic, and only the open ones", () => {
    const s = summarize([mistake(), mistake({ question: "b" }), mistake({ question: "c" }), mistake({ question: "d" }), mistake({ question: "fixed", mastered: true })], []);
    expect(s.topics[0].examples).toHaveLength(3);
    expect(JSON.stringify(s.topics[0].examples)).not.toContain("fixed");
    expect(s.masteredMistakes).toBe(1);
  });
  it("says there isn't enough to go on when the learner has done nothing yet", () => {
    expect(hasEnoughEvidence(summarize([], []))).toBe(false);
    expect(hasEnoughEvidence(summarize([mistake()], []))).toBe(true);
    expect(hasEnoughEvidence(summarize([], [mastery()]))).toBe(true);
  });
  it("puts the learner's answer next to the correct one in the prompt, so the AI can name the misunderstanding", () => {
    const p = evaluationPrompt(summarize([mistake()], [mastery()]));
    expect(p).toContain("they answered: 1.5 V");
    expect(p).toContain("correct: 6 V");
    expect(p).toContain("mastery 30%");
  });
});

describe("the evaluation itself", () => {
  const good = { headline: "Ohm's law needs work", strengths: [], gaps: [{ topic: "Ohm's law", misunderstanding: "divides instead of multiplies", severity: 3 }], plan: [{ title: "Redo", action: "Retest", topic: "Ohm's law", tool: "retest", minutes: 15 }], encouragement: "Keep going" };
  it("accepts a good answer and rejects an invented tool or an empty plan", () => {
    expect(evaluationSchema.safeParse(good).success).toBe(true);
    expect(evaluationSchema.safeParse({ ...good, plan: [{ ...good.plan[0], tool: "hack" }] }).success).toBe(false);
    expect(evaluationSchema.safeParse({ ...good, plan: [] }).success).toBe(false);
    expect(evaluationSchema.safeParse({ ...good, gaps: [{ ...good.gaps[0], severity: 9 }] }).success).toBe(false);
  });
  it("always has a useful fallback from the numbers alone", () => {
    const s = summarize([mistake()], [mastery(), mastery({ title: "Vectors", kcId: "k3", pL: 0.97 })]);
    const f = fallbackEvaluation(s);
    expect(evaluationSchema.safeParse(f).success).toBe(true);
    expect(f.headline).toContain("Ohm's law");
    expect(f.plan[0].tool).toBe("retest");
    expect(f.strengths).toContain("Vectors is solid.");
    expect(evaluationSchema.safeParse(fallbackEvaluation(summarize([], [mastery({ pL: 0.97 })]))).success).toBe(true);
  });
  it("sends each step to a page we know; topic links come from the learner's own topics, never from the AI", () => {
    const s = summarize([mistake()], [mastery()]);
    expect(linkFor("retest", "x", s.topics)).toBe("/study/mistakes");
    expect(linkFor("lesson", "ohm's LAW", s.topics)).toBe("/classes/c1/topics/k1?tab=teach");
    expect(linkFor("quiz", "Ohm's law", s.topics)).toBe("/classes/c1/topics/k1?tab=quiz");
    expect(linkFor("tutor", "Ohm's law", s.topics)).toBe("/tutor?class=c1&topic=k1");
    expect(linkFor("lesson", "Made-up topic", s.topics)).toBe("/study/notes");
    expect(linkFor("quiz", "Made-up topic", s.topics)).not.toContain("made-up");
  });
  it("the same evidence has the same fingerprint, and new answers change it", () => {
    const a = summarize([mistake()], [mastery()]);
    expect(evidenceSignature(a)).toBe(evidenceSignature(summarize([mistake()], [mastery()])));
    expect(evidenceSignature(a)).not.toBe(evidenceSignature(summarize([mistake(), mistake({ question: "new" })], [mastery()])));
  });
});

describe("the evaluation model", () => {
  it("has its own AI task, so an admin can choose its model, and runs on the strongest model group", () => {
    expect(AI_TASK_DEFINITIONS.student_evaluation.label).toBe("Student Evaluation");
    expect(taskGroup("student_evaluation")).toBe("grading");
  });
});
