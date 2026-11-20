import { shouldInjectLearnerDna } from "@/lib/ai/router";
import type { MirrorProfile } from "./schema";

export { DEFAULT_STYLE, sproutReaction, type SproutStyle, type ReactionKind } from "./sprout-voice";
import { DEFAULT_STYLE, type SproutStyle } from "./sprout-voice";

function safeInterest(s: string): string {
  return s.replace(/[^\p{L}\p{N} '&-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 30);
}

export function sproutStyleFrom(profile: MirrorProfile): SproutStyle {
  if (!profile.personalised) return DEFAULT_STYLE;
  const pace = profile.pace.value;
  const lineLength = pace === "quick" || profile.examples === "short" ? "short" : pace === "deep" && profile.examples === "long" ? "long" : "medium";
  const helpy = profile.helpSeeking.source === "observed" && profile.helpSeeking.value > 0.4;
  const hintSpeed = helpy || pace === "deep" ? "fast" : pace === "quick" && profile.confidence.value >= 0.5 ? "slow" : "normal";
  return {
    maxWords: lineLength === "short" ? 14 : lineLength === "long" ? 40 : 24,
    lineLength,
    encouragement: profile.encouragement,
    hintSpeed,
    exampleStyle: profile.examples === "long" ? "worked" : "short",
    interests: profile.interests.map((i) => safeInterest(i.label)).filter(Boolean).slice(0, 3),
  };
}

const MAX_STYLE_CHARS = 520;

/**
 * Text appended to the tutor's system prompt for ONE learner's own, uncached call. Style only: no scores, no names, no
 * topics they struggle with. Returns null when personalisation is off or the call is shared/cached/privileged
 * (the same rules as the Learner DNA: see shouldInjectLearnerDna).
 */
export function sproutPromptAddition(
  profile: MirrorProfile,
  opts: { task?: unknown; cacheKey?: string; learnerLanguage?: boolean; personalize?: boolean; isPrivileged?: boolean } = { task: "tutor_chat" },
): string | null {
  if (!profile.personalised || !shouldInjectLearnerDna(opts)) return null;
  const s = sproutStyleFrom(profile);
  const lines = [
    "<LEARNER_STYLE>",
    "Teaching style for this learner (study preferences only; never mention or guess their personality):",
    `- Keep replies about ${s.maxWords} words per paragraph.`,
    `- Encouragement: ${s.encouragement}.`,
    `- Offer a hint ${s.hintSpeed === "fast" ? "early" : s.hintSpeed === "slow" ? "only after they have tried" : "after a fair attempt"}.`,
    `- Examples: ${s.exampleStyle === "worked" ? "one fully worked example" : "one short example"}.`,
  ];
  if (s.interests.length) lines.push(`- When an example helps, you may draw on: ${s.interests.join(", ")}.`);
  lines.push("</LEARNER_STYLE>");
  const CLOSE = "\n</LEARNER_STYLE>";
  const body = lines.slice(0, -1).join("\n");
  return body.length + CLOSE.length > MAX_STYLE_CHARS ? body.slice(0, MAX_STYLE_CHARS - CLOSE.length) + CLOSE : body + CLOSE;
}
