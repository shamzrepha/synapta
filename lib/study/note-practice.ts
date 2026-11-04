import { z } from "zod";

export const cardsSchema = z.object({
  cards: z.array(z.object({ front: z.string().trim().min(2).max(300), back: z.string().trim().min(1).max(600) })).min(4).max(30),
});
export const quizSchema = z.object({
  questions: z
    .array(
      z
        .object({
          question: z.string().trim().min(5).max(400),
          options: z.array(z.string().trim().min(1).max(200)).min(2).max(4),
          correctIndex: z.number().int().min(0).max(3),
          explanation: z.string().trim().max(500).default(""),
        })
        .refine((q) => q.correctIndex < q.options.length, "answer must be one of the options")
    )
    .min(3)
    .max(15),
});
export type NoteCards = z.output<typeof cardsSchema>["cards"];
export type NoteQuiz = z.output<typeof quizSchema>["questions"];

export const CARDS_SYSTEM = `You write flashcards from a student's study notes. Return JSON {"cards":[{"front":"...","back":"..."}]}.
12 to 20 cards. Each card tests ONE idea: a definition, a formula, a step, a cause, a worked-answer. Front is a clear question or prompt; back is a short, exact answer. Write formulas in LaTeX between single dollar signs. Use only what the notes contain. Plain markdown only.`;

export const QUIZ_SYSTEM = `You write a multiple-choice quiz from a student's study notes. Return JSON {"questions":[{"question":"...","options":["..."],"correctIndex":0,"explanation":"..."}]}.
8 to 10 questions that check understanding (not just wording), each with exactly 4 options, one clearly correct, wrong options that are believable mistakes. "explanation" says why the right answer is right. Vary where the correct option sits. Use only what the notes contain. Formulas in LaTeX between single dollar signs.`;
