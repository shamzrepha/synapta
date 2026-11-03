import { describe, it, expect } from "vitest";
import { describeProfile, guessMode, profileFor, resolveProfile } from "./profile";

describe("what a topic needs", () => {
  it("gives Pythagoras notes, an interactive lesson, practice and the tutor, with no lab", () => {
    const p = resolveProfile({ title: "Pythagoras' theorem", description: "Sides of a right triangle" });
    expect(p.mode).toBe("maths");
    expect(p.needs).toMatchObject({ animation: true, practice: true, tutor: true, simulation: false, build: false, prove: false, flashcards: false });
  });
  it("treats engine maths as maths, not a workshop", () => {
    expect(guessMode("Engine displacement and compression ratio: the maths")).toBe("maths");
    expect(guessMode("Engine assembly and repair")).toBe("practical");
  });
  it("sorts ten different topics", () => {
    const cases: Array<[string, string]> = [
      ["Ohm's law and series circuits", "electronics"],
      ["Python loops and functions", "code"],
      ["Newton's laws of motion", "science"],
      ["The French Revolution", "memorise"],
      ["Time management for students", "general"],
      ["Contract law: offer and acceptance", "memorise"],
      ["Yoruba tenses", "language"],
      ["Quadratic equations", "maths"],
      ["Line-following robotics", "practical"],
      ["Photosynthesis", "science"],
      ["Introduction to accounting", "memorise"],
    ];
    for (const [t, m] of cases) expect(guessMode(t), t).toBe(m);
  });
  it("keeps the full toolset for electronics", () => {
    expect(profileFor("electronics").needs).toMatchObject({ simulation: true, build: true, prove: true });
  });
  it("never hides build labs the teacher already added", () => {
    const p = resolveProfile({ title: "Fractions", labs: [{ id: "l1" }] });
    expect(p.needs.build).toBe(true);
  });
  it("uses the saved profile over a guess, and ignores a broken one", () => {
    const saved = { subject: "Law", mode: "memorise", needs: { ...profileFor("memorise").needs, animation: true }, source: "teacher" };
    expect(resolveProfile({ title: "Pythagoras", studyProfile: saved }).mode).toBe("memorise");
    expect(resolveProfile({ title: "Pythagoras", studyProfile: { mode: "nonsense" } }).mode).toBe("maths");
  });
  it("describes it in plain words", () => {
    expect(describeProfile(profileFor("maths"))).toBe("Sunroot treats this as maths and gives students notes, an interactive lesson, practice questions and the AI tutor.");
  });
});
