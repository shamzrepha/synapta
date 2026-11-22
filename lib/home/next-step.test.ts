import { describe, it, expect } from "vitest";
import { pickNextStep, examNote } from "./next-step";

const topic = { classId: "c1", kcId: "k1", title: "Newton's laws", pct: 40, kind: "continue" as const };

describe("pickNextStep", () => {
  it("leads with adding material for a student with nothing yet", () => {
    const s = pickNextStep({ dueCards: 0, openMistakes: 0, classCount: 0 });
    expect(s.main.id).toBe("add");
  });
  it("puts due reviews before mistakes and topics, with a reason", () => {
    const s = pickNextStep({ dueCards: 12, openMistakes: 3, topic, classCount: 1 });
    expect(s.main.id).toBe("review");
    expect(s.main.title).toBe("Review 12 cards");
    expect(s.main.reason.length).toBeGreaterThan(10);
    expect(s.others.map((x) => x.id)).toContain("mistakes");
  });
  it("uses singular wording", () => {
    expect(pickNextStep({ dueCards: 1, openMistakes: 0, classCount: 1 }).main.title).toBe("Review 1 card");
    expect(pickNextStep({ dueCards: 0, openMistakes: 1, classCount: 1 }).main.title).toBe("Relearn 1 question you missed");
  });
  it("points at the next topic when nothing is due", () => {
    const s = pickNextStep({ dueCards: 0, openMistakes: 0, topic, classCount: 1 });
    expect(s.main.id).toBe("topic");
    expect(s.main.href).toBe("/classes/c1/topics/k1");
    expect(s.main.reason).toContain("40%");
  });
  it("says review, not continue, when every topic is solid", () => {
    const s = pickNextStep({ dueCards: 0, openMistakes: 0, topic: { ...topic, kind: "review", pct: 82 }, classCount: 1 });
    expect(s.main.title.startsWith("Review:")).toBe(true);
  });
  it("offers a different choice and never more than 3 others", () => {
    const s = pickNextStep({ dueCards: 5, openMistakes: 2, topic, classCount: 1 });
    expect(s.others.length).toBeLessThanOrEqual(3);
    expect(s.others.every((o) => o.id !== s.main.id)).toBe(true);
  });
});

describe("examNote", () => {
  it("shows only when the exam is close, in calm words", () => {
    expect(examNote({ name: "WAEC Physics", daysLeft: 9 })).toBe("WAEC Physics is in 9 days.");
    expect(examNote({ name: "WAEC Physics", daysLeft: 1 })).toBe("WAEC Physics is in 1 day.");
    expect(examNote({ name: "Mock", daysLeft: 0 })).toBe("Mock is today.");
    expect(examNote({ name: "Mock", daysLeft: 40 })).toBeNull();
    expect(examNote({ name: "Past", daysLeft: -2 })).toBeNull();
    expect(examNote(null)).toBeNull();
  });
});
