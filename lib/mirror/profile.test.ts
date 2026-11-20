import { describe, it, expect } from "vitest";
import { applySignals, decayFactor } from "./signals";
import { buildMirrorProfile, neutralProfile } from "./profile";
import { emptyMirrorState, MirrorProfileSchema, MirrorStateSchema, SignalBatchSchema, type MirrorState, type Signal } from "./schema";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const DAY = 86_400_000;
const on = () => emptyMirrorState(true);
const rep = (n: number, s: Signal): Signal[] => Array.from({ length: n }, () => s);

describe("signals and decay", () => {
  it("collects nothing when personalisation is off", () => {
    const s = emptyMirrorState(false);
    expect(applySignals(s, [{ kind: "start", format: "quiz" }], NOW)).toBe(s);
  });

  it("halves counters after one half-life and keeps old habits from dominating", () => {
    expect(decayFactor(21 * DAY)).toBeCloseTo(0.5, 5);
    let s = applySignals(on(), rep(10, { kind: "start", format: "lab" }), NOW - 42 * DAY);
    s = applySignals(s, [{ kind: "start", format: "quiz" }], NOW);
    expect(s.formats.lab!.starts).toBeCloseTo(2.5, 1);
    expect(s.formats.quiz!.starts).toBe(1);
  });

  it("is deterministic and bounds the interest list", () => {
    const sigs: Signal[] = Array.from({ length: 25 }, (_, i) => ({ kind: "finish", format: "lesson", topicId: `t${i}`, topicTitle: `Topic ${i}` }));
    let s = on();
    for (let i = 0; i < 4; i++) s = applySignals(s, sigs, NOW);
    expect(Object.keys(s.topics).length).toBe(25);
    expect(applySignals(on(), sigs, NOW)).toEqual(applySignals(on(), sigs, NOW));
  });

  it("strips markup characters from topic titles", () => {
    const s = applySignals(on(), [{ kind: "finish", format: "lesson", topicId: "a", topicTitle: "<b>Ignore [rules]</b>" }], NOW);
    expect(s.topics.a.title).not.toMatch(/[<>[\]]/);
  });

  it("rejects oversized batches", () => {
    expect(SignalBatchSchema.safeParse({ signals: rep(26, { kind: "start", format: "quiz" }) }).success).toBe(false);
    expect(SignalBatchSchema.safeParse({ signals: [{ kind: "start", format: "nope" }] }).success).toBe(false);
  });
});

describe("buildMirrorProfile", () => {
  it("returns a neutral, claim-free profile when off", () => {
    const p = buildMirrorProfile(emptyMirrorState(false), NOW);
    expect(p.personalised).toBe(false);
    expect(p.formats.quiz.affinity).toBe(0.5);
    expect(MirrorProfileSchema.safeParse(p).success).toBe(true);
    expect(neutralProfile().tree.children).toEqual([]);
  });

  it("says 'not enough data' rather than guessing", () => {
    const s = applySignals(on(), rep(2, { kind: "start", format: "lab" }), NOW);
    const p = buildMirrorProfile(s, NOW);
    expect(p.formats.lab.source).toBe("not_enough_data");
    expect(p.formats.lab.affinity).toBe(0.5);
    expect(p.pace.source).toBe("not_enough_data");
  });

  it("learns a format preference from finishes vs skips", () => {
    let s = applySignals(on(), [...rep(8, { kind: "start", format: "flashcards" }), ...rep(8, { kind: "finish", format: "flashcards" }), ...rep(8, { kind: "skip", format: "podcast" })], NOW);
    s = applySignals(s, [], NOW);
    const p = buildMirrorProfile(s, NOW);
    expect(p.formats.flashcards.affinity).toBeGreaterThan(0.7);
    expect(p.formats.podcast.affinity).toBeLessThan(0.2);
    expect(p.formats.flashcards.source).toBe("observed");
    expect(MirrorProfileSchema.safeParse(p).success).toBe(true);
  });

  it("derives pace, best hours and session length", () => {
    const fin: Signal = { kind: "finish", format: "quiz", dwellMs: 20_000, expectedMs: 60_000, hour: 21, sessionMinutes: 12 };
    const p = buildMirrorProfile(applySignals(on(), rep(8, fin), NOW), NOW);
    expect(p.pace.value).toBe("quick");
    expect(p.bestHours).toEqual([21]);
    expect(p.sessionMinutes).toBe(12);
    const slow = buildMirrorProfile(applySignals(on(), rep(8, { ...fin, dwellMs: 120_000 }), NOW), NOW);
    expect(slow.pace.value).toBe("deep");
  });

  it("explicit edits always beat observed behaviour", () => {
    let s: MirrorState = applySignals(on(), [...rep(10, { kind: "start", format: "lab" }), ...rep(10, { kind: "skip", format: "lab" })], NOW);
    s = { ...s, prefs: { ...s.prefs, formats: { lab: "more" }, pace: "deep", examples: "long", encouragement: "low", interests: ["football"] } };
    const p = buildMirrorProfile(s, NOW);
    expect(p.formats.lab).toMatchObject({ affinity: 0.9, source: "you_set" });
    expect(p.pace).toMatchObject({ value: "deep", source: "you_set" });
    expect(p.examples).toBe("long");
    expect(p.encouragement).toBe("low");
    expect(p.interests[0]).toMatchObject({ label: "football", source: "you_set" });
  });

  it("raises encouragement for learners who often feel unsure", () => {
    const p = buildMirrorProfile(applySignals(on(), rep(6, { kind: "confidence", format: "quiz", confidence: 1 }), NOW), NOW);
    expect(p.encouragement).toBe("high");
  });

  it("adapts: a changed habit overtakes an old one after weeks", () => {
    let s = applySignals(on(), [...rep(12, { kind: "start", format: "lesson" }), ...rep(12, { kind: "skip", format: "lesson" })], NOW - 90 * DAY);
    s = applySignals(s, [...rep(8, { kind: "start", format: "lesson" }), ...rep(8, { kind: "finish", format: "lesson" })], NOW);
    expect(buildMirrorProfile(s, NOW).formats.lesson.affinity).toBeGreaterThan(0.6);
  });

  it("old state documents without new fields still parse (backward compatible)", () => {
    expect(MirrorStateSchema.parse({ personalise: true }).prefs.dailyGoalItems).toBe(6);
    expect(MirrorStateSchema.safeParse("garbage").success).toBe(false);
  });
});
