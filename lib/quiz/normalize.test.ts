import { describe, it, expect } from "vitest";
import { normalizeQuizQuestions, resolveCorrectIndex, stripOptionLabel } from "./normalize";

const identityRng = () => 0.999; // Fisher-Yates with rng≈1 keeps the original order

describe("quiz normalization", () => {
  it("strips letter labels from options", () => {
    expect(stripOptionLabel("A) 12 V")).toBe("12 V");
    expect(stripOptionLabel("(c) Ohm")).toBe("Ohm");
    expect(stripOptionLabel("b. current")).toBe("current");
    expect(stripOptionLabel("Amplitude")).toBe("Amplitude");
  });

  it("trusts the answer text over a wrong correctIndex", () => {
    const options = ["2 A", "4 A", "6 A", "8 A"];
    expect(resolveCorrectIndex(options, "6 A", 0)).toBe(2);
  });

  it("accepts a bare letter answer", () => {
    expect(resolveCorrectIndex(["x", "y", "z", "w"], "C", undefined)).toBe(2);
  });

  it("rejects an answer that matches no option", () => {
    expect(resolveCorrectIndex(["1", "2", "3", "4"], "5", 1)).toBe(-1);
  });

  it("falls back to correctIndex when no answer text is given", () => {
    expect(resolveCorrectIndex(["a", "b", "c", "d"], undefined, 3)).toBe(3);
  });

  it("drops unreliable, duplicate and malformed questions", () => {
    const out = normalizeQuizQuestions(
      [
        { question: "What is $V$ when $I=2$ A and $R=3\\,\\Omega$?", options: ["A) 5 V", "B) 6 V", "C) 1.5 V", "D) 9 V"], answer: "6 V", correctIndex: 0, explanation: "V = IR" },
        { question: "What is $V$ when $I=2$ A and $R=3\\,\\Omega$?", options: ["5", "6", "7", "8"], answer: "6" },
        { question: "Broken answer question", options: ["a", "b", "c", "d"], answer: "e" },
        { question: "Too few options here", options: ["a", "a"], answer: "a" },
        { nope: true },
      ],
      { rng: identityRng }
    );
    expect(out).toHaveLength(1);
    expect(out[0].options).toEqual(["5 V", "6 V", "1.5 V", "9 V"]);
    expect(out[0].options[out[0].correctIndex]).toBe("6 V");
  });

  it("keeps the correct answer aligned after shuffling", () => {
    let seed = 7;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let n = 0; n < 20; n++) {
      const [q] = normalizeQuizQuestions(
        [
          {
            question: `Q${n}: which is right?`,
            options: ["wrong one", "right one", "wrong two", "wrong three"],
            answer: "right one",
            distractorMisconceptions: ["m1", "", "m2", "m3"],
          },
        ],
        { rng }
      );
      expect(q.options[q.correctIndex]).toBe("right one");
      expect(q.distractorMisconceptions?.[q.correctIndex]).toBe("");
      const wrongIdx = q.options.indexOf("wrong two");
      expect(q.distractorMisconceptions?.[wrongIdx]).toBe("m2");
    }
  });
});
