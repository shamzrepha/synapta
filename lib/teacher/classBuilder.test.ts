import { describe, it, expect } from "vitest";
import {
  slugify,
  validateAndPruneCycles,
  deriveBktPriors,
} from "./classBuilder";

describe("lib/teacher/classBuilder", () => {
  describe("slugify", () => {
    it("converts titles into clean URL-safe slugs", () => {
      expect(slugify("Introduction to Ordinary Differential Equations (ODEs)!")).toBe(
        "introduction-to-ordinary-differential-eq"
      );
    });
  });

  describe("validateAndPruneCycles", () => {
    it("detects and breaks circular prerequisite dependencies", () => {
      // Node A requires B, Node B requires C, Node C requires A (cycle)
      const nodes = [
        { id: "A", prerequisiteIds: ["B"] },
        { id: "B", prerequisiteIds: ["C"] },
        { id: "C", prerequisiteIds: ["A"] },
      ];

      const result = validateAndPruneCycles(nodes);
      expect(result.hasCycle).toBe(true);
      expect(result.prunedEdges.length).toBeGreaterThanOrEqual(1);

      // Verify that after pruning, the cycle is broken
      const rechecked = validateAndPruneCycles(nodes);
      expect(rechecked.hasCycle).toBe(false);
    });

    it("passes a legitimate DAG without pruning any edges", () => {
      const nodes = [
        { id: "linear-algebra", prerequisiteIds: [] },
        { id: "calculus-1", prerequisiteIds: [] },
        { id: "multivariable-calc", prerequisiteIds: ["calculus-1"] },
        { id: "vector-fields", prerequisiteIds: ["linear-algebra", "multivariable-calc"] },
      ];

      const result = validateAndPruneCycles(nodes);
      expect(result.hasCycle).toBe(false);
      expect(result.prunedEdges).toHaveLength(0);
    });
  });

  describe("deriveBktPriors", () => {
    it("assigns appropriate initial priors for introductory level", () => {
      const priors = deriveBktPriors("introductory", "school");
      expect(priors.pL0).toBe(0.30);
      expect(priors.pG).toBe(0.25);
    });

    it("assigns lower initial priors and higher slips for advanced level", () => {
      const priors = deriveBktPriors("advanced", "undergrad");
      expect(priors.pL0).toBe(0.10);
      expect(priors.pS).toBe(0.14);
    });
  });
});
