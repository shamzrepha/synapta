import { z } from "zod";

// 1. Syllabus Synthesis Schema
export const syllabusKcSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(10),
  objectives: z.array(z.string()).min(1),
  lessonMarkdown: z.string().min(50),
  prerequisiteTitles: z.array(z.string()).default([]),
  bkt: z.object({
    pL0: z.number().min(0.01).max(0.99).default(0.2),
    pT: z.number().min(0.01).max(0.99).default(0.15),
    pG: z.number().min(0.01).max(0.99).default(0.2),
    pS: z.number().min(0.01).max(0.99).default(0.1),
  }).default({ pL0: 0.2, pT: 0.15, pG: 0.2, pS: 0.1 }),
  lab: z.object({
    type: z.enum(["ohms_law", "rc_filter", "logic_gates", "projectile", "none"]).default("none"),
    config: z.record(z.union([z.string(), z.number()])).default({}),
  }).default({ type: "none", config: {} }),
});

export const syllabusSynthesisResponseSchema = z.object({
  kcs: z.array(syllabusKcSchema).min(3).max(15),
});

export type SyllabusSynthesisResponse = z.infer<typeof syllabusSynthesisResponseSchema>;
export type SyllabusKc = z.infer<typeof syllabusKcSchema>;

// 2. Quiz Schema
export const quizQuestionSchema = z.object({
  question: z.string().min(5),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(5),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  distractorMisconceptions: z.array(z.string()).optional(),
});

export const quizResponseSchema = z.object({
  questions: z.array(quizQuestionSchema).min(3).max(10),
});

export type QuizResponse = z.infer<typeof quizResponseSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

// 3. Flashcards Schema
export const flashcardSchema = z.object({
  front: z.string().min(3),
  back: z.string().min(5),
});

export const flashcardsResponseSchema = z.object({
  cards: z.array(flashcardSchema).min(5).max(15),
});

export type FlashcardsResponse = z.infer<typeof flashcardsResponseSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;

// 4. Two-Host Deep Dive Discussion Schema
export const discussionTurnSchema = z.object({
  speaker: z.enum(["Alex", "Sam"]),
  text: z.string().min(5),
});

export const discussionResponseSchema = z.object({
  title: z.string(),
  turns: z.array(discussionTurnSchema).min(8).max(25),
});

export type DiscussionResponse = z.infer<typeof discussionResponseSchema>;
export type DiscussionTurn = z.infer<typeof discussionTurnSchema>;
