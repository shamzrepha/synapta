import { describe, it, expect } from "vitest";
import { sproutStyleFrom, sproutPromptAddition, sproutReaction, DEFAULT_STYLE } from "./sprout-style";
import { neutralProfile, buildMirrorProfile } from "./profile";
import { emptyMirrorState } from "./schema";
import { fallbackSummary, summaryIsSafe, summaryWanted, summaryIsFresh, SUMMARY_TTL_MS } from "./summary";
import { applySignals } from "./signals";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const withPrefs = (prefs: object) => {
  const s = emptyMirrorState(true);
  return buildMirrorProfile({ ...s, prefs: { ...s.prefs, ...prefs } }, NOW);
};

describe("Sprout style", () => {
  it("is the default voice when personalisation is off, and adds nothing to prompts", () => {
    expect(sproutStyleFrom(neutralProfile())).toEqual(DEFAULT_STYLE);
    expect(sproutPromptAddition(neutralProfile())).toBeNull();
  });

  it("maps pace, examples and encouragement to voice parameters", () => {
    const quick = sproutStyleFrom(withPrefs({ pace: "quick", encouragement: "high" }));
    expect(quick).toMatchObject({ lineLength: "short", maxWords: 14, encouragement: "high", exampleStyle: "short" });
    const slow = sproutStyleFrom(withPrefs({ pace: "deep", examples: "long" }));
    expect(slow).toMatchObject({ lineLength: "long", hintSpeed: "fast", exampleStyle: "worked" });
  });

  it("builds a short, fenced, style-only prompt addition", () => {
    const text = sproutPromptAddition(withPrefs({ interests: ["football", "<script>x</script>"], examples: "short" }))!;
    expect(text.startsWith("<LEARNER_STYLE>")).toBe(true);
    expect(text.endsWith("</LEARNER_STYLE>")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(520);
    expect(text).toContain("football");
    expect(text.match(/<\/?LEARNER_STYLE>/g)).toHaveLength(2); // nothing the learner typed can open or close the fence
    expect(text).not.toMatch(/<script|mastery|%/i);
  });

  it("follows the Learner DNA rules: never into shared caches, class content or teacher calls", () => {
    const p = withPrefs({ pace: "quick" });
    expect(sproutPromptAddition(p, { task: "tutor_chat" })).not.toBeNull();
    expect(sproutPromptAddition(p, { task: "tutor_chat", cacheKey: "shared:x" })).toBeNull();
    expect(sproutPromptAddition(p, { task: "tutor_chat", learnerLanguage: false })).toBeNull();
    expect(sproutPromptAddition(p, { task: "tutor_chat", isPrivileged: true })).toBeNull();
    expect(sproutPromptAddition(p, { task: "quiz_gen" })).toBeNull();
  });

  it("reactions respect encouragement and line length", () => {
    expect(sproutReaction("correct", { ...DEFAULT_STYLE, encouragement: "low" })).toBe("Correct.");
    expect(sproutReaction("done", { ...DEFAULT_STYLE, encouragement: "high", maxWords: 4 }).split(" ").length).toBeLessThanOrEqual(5);
  });
});

describe("summary", () => {
  it("is plain, habit-only, and never labels people", () => {
    const s = applySignals(emptyMirrorState(true), Array.from({ length: 10 }, () => ({ kind: "finish" as const, format: "quiz" as const, hour: 20, dwellMs: 1000, expectedMs: 4000 })), NOW);
    const text = fallbackSummary(buildMirrorProfile(s, NOW));
    expect(text).toMatch(/study habits only/);
    expect(summaryIsSafe(text)).toBe(true);
    expect(summaryIsSafe("You have an introvert personality")).toBe(false);
    expect(fallbackSummary(neutralProfile())).toMatch(/not enough/i);
  });

  it("asks the AI at most once a week, and only with enough evidence and consent", () => {
    const base = emptyMirrorState(true);
    const rich = { ...buildMirrorProfile(base, NOW), evidence: 50 };
    expect(summaryWanted(base, rich, NOW)).toBe(true);
    const cached = { ...base, summary: { text: "x", at: NOW - 1000 } };
    expect(summaryIsFresh(cached, NOW)).toBe(true);
    expect(summaryWanted(cached, rich, NOW)).toBe(false);
    expect(summaryWanted(cached, rich, NOW + SUMMARY_TTL_MS + 1)).toBe(true);
    expect(summaryWanted({ ...base, personalise: false }, rich, NOW)).toBe(false);
    expect(summaryWanted(base, { ...rich, evidence: 3 }, NOW)).toBe(false);
  });
});
