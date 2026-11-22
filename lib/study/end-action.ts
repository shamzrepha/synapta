/**
 * The ONE action an end-of-topic card leads with, chosen from what the student has shown (not from "I read it").
 * "I got it / Not yet" is a confidence signal, not an assessment, so a quiz is still the lead after a good recall.
 */
export type EndAction = "quiz" | "review-tricky" | "next" | "none";

export function pickEndAction(i: { recallFinished: boolean; recallPassed: boolean; hasPractice: boolean; hasNext: boolean }): EndAction {
  if (i.recallFinished && !i.recallPassed && i.hasPractice) return "review-tricky";
  if (i.hasPractice) return "quiz";
  return i.hasNext ? "next" : "none";
}
