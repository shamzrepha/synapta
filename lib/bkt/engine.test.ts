import { describe, it, expect } from "vitest";
import {
  updateMastery,
  validateBktParameters,
  isMastered,
  isStruggling,
  isStrong,
  OMEGA,
} from "./engine";

describe("Bayesian Knowledge Tracing (BKT) Engine", () => {
  const standardParams = { pT: 0.15, pG: 0.20, pS: 0.10 };

  it("increases mastery probability P(L) after a correct answer", () => {
    const pLPrev = 0.40;
    const pLNext = updateMastery(pLPrev, true, standardParams, "quiz");
    expect(pLNext).toBeGreaterThan(pLPrev);
  });

  it("decreases mastery probability P(L) after an incorrect answer", () => {
    const pLPrev = 0.60;
    const pLNext = updateMastery(pLPrev, false, standardParams, "quiz");
    expect(pLNext).toBeLessThan(pLPrev);
  });

  it("demonstrates higher mastery growth from in-situ labs than quizzes due to omega weighting", () => {
    const pLPrev = 0.35;
    const quizResult = updateMastery(pLPrev, true, standardParams, "quiz");
    const labResult = updateMastery(pLPrev, true, standardParams, "lab");

    expect(labResult).toBeGreaterThan(quizResult);
    expect(OMEGA.lab).toBe(1.75);
    expect(OMEGA.quiz).toBe(1.0);
  });

  it("scales learning according to omega ordering: peer_explain > lab > flashcard > quiz", () => {
    const pLPrev = 0.30;
    const quiz = updateMastery(pLPrev, true, standardParams, "quiz");
    const flashcard = updateMastery(pLPrev, true, standardParams, "flashcard");
    const lab = updateMastery(pLPrev, true, standardParams, "lab");
    const peer = updateMastery(pLPrev, true, standardParams, "peer_explain");

    expect(peer).toBeGreaterThan(lab);
    expect(lab).toBeGreaterThan(flashcard);
    expect(flashcard).toBeGreaterThan(quiz);
  });

  it("safely clamps extreme probability inputs and outputs within [0.0001, 0.9999]", () => {
    // Extreme high prior
    const highNext = updateMastery(0.9999, true, standardParams, "quiz");
    expect(highNext).toBeLessThanOrEqual(0.9999);
    expect(highNext).toBeGreaterThanOrEqual(0.0001);

    // Extreme low prior with wrong answer
    const lowNext = updateMastery(0.0001, false, standardParams, "quiz");
    expect(lowNext).toBeGreaterThanOrEqual(0.0001);
    expect(lowNext).toBeLessThanOrEqual(0.9999);
  });

  it("enforces model identifiability condition: pG + pS < 1", () => {
    const invalidParams = { pT: 0.15, pG: 0.60, pS: 0.50 }; // sum = 1.10
    expect(() => validateBktParameters(invalidParams)).toThrow(
      /Model identifiability violation/
    );

    const boundaryParams = { pT: 0.15, pG: 0.50, pS: 0.50 }; // sum = 1.00
    expect(() => validateBktParameters(boundaryParams)).toThrow(
      /Model identifiability violation/
    );
  });

  it("rejects parameters outside the open interval (0, 1)", () => {
    expect(() => validateBktParameters({ pT: 0, pG: 0.2, pS: 0.1 })).toThrow();
    expect(() => validateBktParameters({ pT: 1.2, pG: 0.2, pS: 0.1 })).toThrow();
    expect(() => validateBktParameters({ pT: 0.15, pG: -0.1, pS: 0.1 })).toThrow();
    expect(() => validateBktParameters({ pT: 0.15, pG: 0.2, pS: 1.0 })).toThrow();
  });

  it("accurately classifies mastery states: mastered (>= 0.95), struggling (< 0.40), strong (> 0.85)", () => {
    expect(isMastered(0.95)).toBe(true);
    expect(isMastered(0.949)).toBe(false);

    expect(isStruggling(0.39)).toBe(true);
    expect(isStruggling(0.40)).toBe(false);

    expect(isStrong(0.86)).toBe(true);
    expect(isStrong(0.85)).toBe(false);
  });
});
