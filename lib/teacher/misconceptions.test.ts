import { describe, it, expect } from "vitest";
import { evaluateMisconceptionTransition, sanitizeMisconceptionId } from "./misconceptions";

describe("Misconception Detection and Resolution Engine", () => {
  it("sanitizes labels into clean document IDs", () => {
    expect(sanitizeMisconceptionId("Current gets used up in resistor")).toBe("current_gets_used_up_in_resistor");
    expect(sanitizeMisconceptionId("   Voltage = Current / R ???  ")).toBe("voltage_current_r");
  });

  it("increments occurrences on incorrect answer", () => {
    const res = evaluateMisconceptionTransition({
      current: null,
      isCorrect: false,
      label: "Current is consumed",
    });

    expect(res.occurrences).toBe(1);
    expect(res.consecutiveCorrect).toBe(0);
    expect(res.resolved).toBe(false);
  });

  it("marks misconception resolved after 2 consecutive correct answers", () => {
    // First correct answer
    const step1 = evaluateMisconceptionTransition({
      current: { occurrences: 2, consecutiveCorrect: 0, resolved: false },
      isCorrect: true,
      label: "Current is consumed",
    });

    expect(step1.consecutiveCorrect).toBe(1);
    expect(step1.resolved).toBe(false);

    // Second consecutive correct answer
    const step2 = evaluateMisconceptionTransition({
      current: { occurrences: 2, consecutiveCorrect: step1.consecutiveCorrect, resolved: false },
      isCorrect: true,
      label: "Current is consumed",
    });

    expect(step2.consecutiveCorrect).toBe(2);
    expect(step2.resolved).toBe(true);
  });

  it("resets consecutiveCorrect if learner relapses into incorrect answer", () => {
    const relapse = evaluateMisconceptionTransition({
      current: { occurrences: 2, consecutiveCorrect: 1, resolved: false },
      isCorrect: false,
      label: "Current is consumed",
    });

    expect(relapse.occurrences).toBe(3);
    expect(relapse.consecutiveCorrect).toBe(0);
    expect(relapse.resolved).toBe(false);
  });
});
