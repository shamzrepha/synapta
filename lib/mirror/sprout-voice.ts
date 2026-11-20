/** Client-safe part of the Sprout style (no server imports): the voice parameters and the short reaction lines. */
export interface SproutStyle {
  /** words per bubble / reply line */
  maxWords: number;
  lineLength: "short" | "medium" | "long";
  encouragement: "low" | "medium" | "high";
  /** how long Sprout waits before offering a hint */
  hintSpeed: "fast" | "normal" | "slow";
  exampleStyle: "short" | "worked";
  /** things the learner likes, safe to use for examples (already cleaned) */
  interests: string[];
}

export const DEFAULT_STYLE: SproutStyle = { maxWords: 24, lineLength: "medium", encouragement: "medium", hintSpeed: "normal", exampleStyle: "short", interests: [] };

export type ReactionKind = "correct" | "wrong" | "done" | "skip" | "hint";

const LINES: Record<ReactionKind, Record<SproutStyle["encouragement"], string[]>> = {
  correct: { low: ["Correct."], medium: ["Nice, that is right."], high: ["Yes! That is exactly right, well done!"] },
  wrong: { low: ["Not quite. Look again."], medium: ["Not quite. Want a hint?"], high: ["Close, and mistakes are how this sticks. Want a hint?"] },
  done: { low: ["Done."], medium: ["Done. Good work."], high: ["You did it! That was a real step forward."] },
  skip: { low: ["Skipped."], medium: ["Okay, we will try something else."], high: ["No problem at all. Let us try something that suits you better."] },
  hint: { low: ["Hint ready."], medium: ["Here is a nudge."], high: ["Here is a little nudge, you have got this."] },
};

/** A short bubble for Sprout, trimmed to the learner's line length. */
export function sproutReaction(kind: ReactionKind, style: SproutStyle): string {
  const text = LINES[kind][style.encouragement][0];
  const words = text.split(" ");
  return words.length <= style.maxWords ? text : `${words.slice(0, style.maxWords).join(" ")}.`;
}
