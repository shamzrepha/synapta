import { z } from "zod";
import { FORMAT_LABEL, FORMATS, type Format, type MirrorProfile, type MirrorState } from "./schema";

export const SUMMARY_TTL_MS = 7 * 86_400_000;
/** Do not spend an AI call until there is something real to describe. */
export const SUMMARY_MIN_EVIDENCE = 20;

export const summarySchema = z.object({ text: z.string().trim().min(1).max(500) });

export function summaryIsFresh(state: MirrorState, nowMs: number): boolean {
  return !!state.summary && nowMs - state.summary.at < SUMMARY_TTL_MS;
}

export function summaryWanted(state: MirrorState, profile: MirrorProfile, nowMs: number): boolean {
  return state.personalise && profile.evidence >= SUMMARY_MIN_EVIDENCE && !summaryIsFresh(state, nowMs);
}

const hourPart = (h: number) => (h < 5 ? "late at night" : h < 12 ? "in the morning" : h < 17 ? "in the afternoon" : h < 21 ? "in the evening" : "at night");

/** The facts the model (or the fallback) may use: study habits only, no scores, no free text the learner typed. */
export function summaryFacts(profile: MirrorProfile): string[] {
  const facts: string[] = [];
  const top = (FORMATS as readonly Format[])
    .filter((f) => profile.formats[f]?.source !== "not_enough_data")
    .sort((a, b) => profile.formats[b].affinity - profile.formats[a].affinity)[0];
  if (top && profile.formats[top].affinity > 0.55) facts.push(`finishes ${FORMAT_LABEL[top].toLowerCase()} most often`);
  if (profile.pace.source !== "not_enough_data") facts.push(profile.pace.value === "quick" ? "moves quickly" : profile.pace.value === "deep" ? "takes time on each item" : "keeps a steady pace");
  if (profile.bestHours.length) facts.push(`studies mostly ${hourPart(profile.bestHours[0])}`);
  if (profile.sessionMinutes) facts.push(`usually studies about ${profile.sessionMinutes} minutes at a time`);
  if (profile.persistence.source === "observed" && profile.persistence.value > 0.7) facts.push("usually finishes what they start");
  return facts.slice(0, 5);
}

/** Plain, honest text from the numbers alone: used when the AI is off, over quota, or the learner has not enough data. */
export function fallbackSummary(profile: MirrorProfile): string {
  const facts = summaryFacts(profile);
  if (!facts.length) return "There is not enough yet to describe how you study. Keep going and this will fill in.";
  return `From how you use Sunroot, you ${facts.join(", ")}. This describes your study habits only, and you can change any of it.`;
}

export const SUMMARY_SYSTEM = [
  "You write two short, friendly sentences telling a student about their own study habits.",
  "Use ONLY the facts given. Describe habits, never personality, intelligence, ability or diagnoses.",
  "Do not use the words 'type', 'personality', 'style of person'. Do not give advice. Under 60 words. Second person ('you').",
].join(" ");

export function summaryPrompt(profile: MirrorProfile): string {
  return `Facts about this learner's study habits:\n${summaryFacts(profile).map((f) => `- ${f}`).join("\n")}\nWrite the two sentences.`;
}

/** Rejects model output that drifts into labelling people. */
export function summaryIsSafe(text: string): boolean {
  return !/\b(personality|introvert|extrovert|adhd|autis|dyslex|diagnos|iq\b|intelligen|smart|lazy|type of person)/i.test(text);
}
