import { describe, it, expect } from "vitest";
import {
  propagateDiagnosticAnswer,
  getTransitivePrerequisites,
  getTransitiveDependents,
  selectNextAdaptiveKc,
  computeDiagnosticSummary,
  KcGraphNode,
} from "./propagate";

describe("BKT Diagnostic Propagation Engine", () => {
  // Linear chain: kc1 -> kc2 -> kc3
  // Diamond: kc1 -> kc2a, kc1 -> kc2b -> kc3
  const sampleGraph: KcGraphNode[] = [
    { id: "kc1", title: "Ohm's Law", prerequisiteIds: [] },
    { id: "kc2", title: "Kirchhoff's Laws", prerequisiteIds: ["kc1"] },
    { id: "kc3", title: "RC Filters", prerequisiteIds: ["kc2"] },
    { id: "kc4", title: "Digital Logic", prerequisiteIds: [] },
    { id: "kc5", title: "Adders & ALU", prerequisiteIds: ["kc4"] },
  ];

  it("computes transitive prerequisites correctly", () => {
    const prereqs = getTransitivePrerequisites("kc3", sampleGraph);
    expect(prereqs).toContain("kc2");
    expect(prereqs).toContain("kc1");
    expect(prereqs).not.toContain("kc4");
  });

  it("computes transitive dependents correctly", () => {
    const dependents = getTransitiveDependents("kc1", sampleGraph);
    expect(dependents).toContain("kc2");
    expect(dependents).toContain("kc3");
    expect(dependents).not.toContain("kc4");
  });

  it("raises prerequisite priors when downstream KC is answered correctly", () => {
    const initialMap = {
      kc1: 0.30,
      kc2: 0.35,
      kc3: 0.40,
      kc4: 0.20,
    };

    const updated = propagateDiagnosticAnswer({
      currentPLMap: initialMap,
      answeredKcId: "kc3",
      isCorrect: true,
      kcs: sampleGraph,
    });

    // Both ancestors kc1 and kc2 should be boosted
    expect(updated.kc1).toBeGreaterThan(0.30);
    expect(updated.kc2).toBeGreaterThan(0.35);
    // Unrelated kc4 remains untouched
    expect(updated.kc4).toBe(0.20);
    // Upper bound cap is respected
    expect(updated.kc1).toBeLessThanOrEqual(0.95);
  });

  it("lowers dependent priors when foundational KC is answered incorrectly", () => {
    const initialMap = {
      kc1: 0.50,
      kc2: 0.40,
      kc3: 0.35,
      kc4: 0.20,
    };

    const updated = propagateDiagnosticAnswer({
      currentPLMap: initialMap,
      answeredKcId: "kc1",
      isCorrect: false,
      kcs: sampleGraph,
    });

    // Both descendants kc2 and kc3 should be penalized
    expect(updated.kc2).toBeLessThan(0.40);
    expect(updated.kc3).toBeLessThan(0.35);
    // Unrelated kc4 remains untouched
    expect(updated.kc4).toBe(0.20);
    // Lower bound floor is respected
    expect(updated.kc2).toBeGreaterThanOrEqual(0.05);
  });

  it("selects next adaptive KC with highest uncertainty (closest to pL = 0.50)", () => {
    const currentPLMap = {
      kc1: 0.90, // very high confidence
      kc2: 0.48, // very close to 0.50 (high uncertainty)
      kc3: 0.15, // far from 0.50
      kc4: 0.20,
      kc5: 0.20,
    };

    const next = selectNextAdaptiveKc({
      kcs: sampleGraph,
      answeredKcIds: ["kc1"],
      currentPLMap,
    });

    // kc2 is unlocked (kc1 pL = 0.90 >= 0.60) and has pL 0.48 (diff 0.02)
    expect(next).toBe("kc2");
  });

  it("computes diagnostic placement summary accurately", () => {
    const finalPLMap = {
      kc1: 0.85, // strong
      kc2: 0.55, // in progress
      kc3: 0.25, // weak
      kc4: 0.75, // strong
      kc5: 0.30, // weak
    };

    const summary = computeDiagnosticSummary({
      kcs: sampleGraph,
      finalPLMap,
    });

    expect(summary.strongKcs.map((k) => k.id)).toEqual(["kc1", "kc4"]);
    expect(summary.weakKcs.map((k) => k.id)).toEqual(["kc3", "kc5"]);
    expect(summary.inProgressKcs.map((k) => k.id)).toEqual(["kc2"]);
    // kc2 is the first unmastered KC whose prereqs are met (kc1 is 0.85 >= 0.65)
    expect(summary.suggestedFirstKc?.id).toBe("kc2");
  });
});
