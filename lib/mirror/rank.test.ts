import { describe, it, expect } from "vitest";
import { rankCandidates, seededRng, epsilon, MAX_SAME_FORMAT_IN_ROW, type Candidate } from "./rank";
import { neutralProfile, buildMirrorProfile } from "./profile";
import { emptyMirrorState, type Format } from "./schema";
import { applySignals } from "./signals";
import { candidatesFrom, type FeedInputs } from "./feed";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const cand = (id: string, format: Format, o: Partial<Candidate> = {}): Candidate => ({
  id, kind: format === "flashcards" ? "due_cards" : format === "quiz" ? "quiz" : format === "lab" ? "lab" : format === "podcast" ? "podcast" : format === "written" ? "written" : "lesson",
  format, title: id, href: `/x/${id}`, minutes: 5, mastery: 0.5, dueDays: null, examDays: null, ...o,
});
const lover = (format: Format) => {
  const s = applySignals(emptyMirrorState(true), [...Array.from({ length: 12 }, () => ({ kind: "start" as const, format })), ...Array.from({ length: 12 }, () => ({ kind: "finish" as const, format }))], NOW);
  return buildMirrorProfile(s, NOW);
};

describe("rankCandidates", () => {
  it("same seed gives the same feed; a different seed may explore differently", () => {
    const cs = [cand("a", "quiz"), cand("b", "lab"), cand("c", "lesson"), cand("d", "podcast")];
    const ctx = { profile: lover("quiz"), seed: "s1", totalSignals: 5 };
    expect(rankCandidates(cs, ctx).map((i) => i.id)).toEqual(rankCandidates(cs, ctx).map((i) => i.id));
    expect(seededRng(1)()).toBe(seededRng(1)());
    expect(seededRng(1)()).not.toBe(seededRng(2)());
  });

  it("an overdue review and a big mastery gap outrank a format the learner loves but does not need", () => {
    const profile = lover("lab");
    const loved = cand("lab-easy", "lab", { mastery: 0.9 });
    const due = cand("cards", "flashcards", { dueDays: -3, mastery: null });
    const weak = cand("weak", "lesson", { mastery: 0.3 });
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const out = rankCandidates([loved, weak, due], { profile, seed, totalSignals: 0 });
      expect(out.map((i) => i.id)).not.toContain("lab-easy"); // nothing to gain: left out
      expect(out[0].id).toBe("cards");
    }
    const mid = cand("lab-mid", "lab", { mastery: 0.6 });
    for (const seed of [1, 2, 3, 4, 5]) {
      const out = rankCandidates([mid, weak], { profile, seed, totalSignals: 0 });
      expect(out[0].id).toBe("weak");
    }
  });

  it("exam urgency lifts a topic and says why", () => {
    const near = cand("near", "quiz", { mastery: 0.45, examDays: 2 });
    const far = cand("far", "lesson", { mastery: 0.45, examDays: null });
    const out = rankCandidates([far, near], { profile: neutralProfile(), seed: 1, totalSignals: 0 });
    expect(out[0].id).toBe("near");
    expect(out[0].why).toMatch(/exam is in 2 days/);
  });

  it("preference breaks ties between equal needs", () => {
    const a = cand("quiz-a", "quiz", { mastery: 0.5 });
    const b = cand("lab-b", "lab", { mastery: 0.5 });
    const out = rankCandidates([a, b], { profile: lover("lab"), seed: 3, totalSignals: 400 });
    expect(out[0].id).toBe("lab-b");
  });

  it("every item has a non-empty why and a reason", () => {
    const cs = [cand("c1", "flashcards", { dueDays: -1, count: 12 }), cand("c2", "lesson", { mastery: 0.2 }), cand("c3", "quiz", { mastery: 0.45 })];
    for (const i of rankCandidates(cs, { profile: lover("quiz"), seed: 9, totalSignals: 3 })) {
      expect(i.why.length).toBeGreaterThan(10);
      expect(["due", "gap", "exam", "preference", "explore"]).toContain(i.reason);
    }
  });

  it("never shows more than 2 of the same format in a row, and stops rather than repeat", () => {
    const cs = Array.from({ length: 6 }, (_, i) => cand(`q${i}`, "quiz", { mastery: 0.2 })).concat([cand("l1", "lesson", { mastery: 0.3 })]);
    const out = rankCandidates(cs, { profile: neutralProfile(), seed: 1, totalSignals: 0, limit: 8 });
    for (let i = MAX_SAME_FORMAT_IN_ROW; i < out.length; i++) {
      expect(new Set(out.slice(i - MAX_SAME_FORMAT_IN_ROW, i + 1).map((x) => x.format)).size).toBeGreaterThan(1);
    }
    expect(out.map((x) => x.format).join()).toBe("quiz,quiz,lesson,quiz,quiz");
    // the rule also holds across calls
    const next = rankCandidates(cs, { profile: neutralProfile(), seed: 1, totalSignals: 0, recentFormats: ["quiz", "quiz"] });
    expect(next[0].format).toBe("lesson");
  });

  it("caps the session and drops done items; skipped items sink", () => {
    const cs = Array.from({ length: 20 }, (_, i) => cand(`i${i}`, (["quiz", "lab", "lesson", "podcast", "written"] as Format[])[i % 5], { mastery: 0.2 }));
    expect(rankCandidates(cs, { profile: neutralProfile(), seed: 1, totalSignals: 0, limit: 50 }).length).toBeLessThanOrEqual(8);
    const out = rankCandidates(cs, { profile: neutralProfile(), seed: 1, totalSignals: 0, doneIds: ["i0"], skippedIds: ["i1"] });
    expect(out.map((i) => i.id)).not.toContain("i0");
    const [a, b] = [cand("x", "quiz", { mastery: 0.3 }), cand("y", "lab", { mastery: 0.3 })];
    expect(rankCandidates([a, b], { profile: neutralProfile(), seed: 1, totalSignals: 0, skippedIds: ["x"] })[0].id).toBe("y");
  });

  it("returns nothing when the learner is caught up", () => {
    expect(rankCandidates([cand("m", "quiz", { mastery: 0.95 })], { profile: neutralProfile(), seed: 1, totalSignals: 0 })).toEqual([]);
  });

  it("exploration decays as we learn more", () => {
    expect(epsilon(0)).toBeCloseTo(1, 5);
    expect(epsilon(600)).toBeLessThan(0.16);
    expect(epsilon(600)).toBeGreaterThan(0.14);
  });

  it("personalisation off ranks by need only, same for every seed", () => {
    const cs = [cand("a", "quiz", { mastery: 0.4 }), cand("b", "lab", { mastery: 0.3 })];
    const ids = (seed: number) => rankCandidates(cs, { profile: neutralProfile(), seed, totalSignals: 0 }).map((i) => i.id);
    expect(ids(1)).toEqual(ids(99));
    expect(ids(1)[0]).toBe("b");
  });
});

describe("candidatesFrom (only content the learner may see)", () => {
  const inputs = (kc: object): FeedInputs => ({
    today: "2026-11-20", nowMs: NOW, dueCards: 0, notes: [], exams: [{ date: "2026-11-25", classIds: ["c1"] }],
    topics: [{ classId: "c1", kcId: "k1", title: "Gravitation", kc }],
    mastery: { "c1:k1": { pL: 0.3, reviewAtMs: NOW - 2 * 86_400_000 } },
  });
  it("leaves out anything the lecturer has not published", () => {
    const out = candidatesFrom(inputs({ contentPublished: { lesson: false, audio: false, simulation: false, practice: false } }));
    expect(out).toEqual([]);
    const some = candidatesFrom(inputs({ contentPublished: { lesson: true, audio: false, simulation: false, practice: { at: 1 } } }));
    expect(some.map((c) => c.format).sort()).toEqual(["lesson", "quiz", "written"]);
  });
  it("carries mastery, due-ness and exam days, and adds the learner's own cards and notes", () => {
    const i = inputs({});
    i.dueCards = 7;
    i.notes = [{ id: "n1", title: "Waves" }];
    const out = candidatesFrom(i);
    expect(out.find((c) => c.id === "cards:due")).toMatchObject({ count: 7, dueDays: 0 });
    expect(out.find((c) => c.id === "quiz:c1:k1")).toMatchObject({ mastery: 0.3, dueDays: -2, examDays: 5 });
    expect(out.find((c) => c.id === "note:n1")).toBeTruthy();
  });
});
