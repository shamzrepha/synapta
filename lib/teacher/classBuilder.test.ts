import { describe, it, expect } from "vitest";
import {
  slugify,
  validateAndPruneCycles,
  deriveBktPriors,
  extractOutlineHeadings,
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

  describe("extractOutlineHeadings (Fix Pack C5 Outline-First)", () => {
    it("extracts structured headings 1:1 from numbered and markdown outline notes", () => {
      const outline = `
1. Introduction to Feedback Control
2. Frequency Domain Analysis & Transfer Functions
3. Stability Criteria & Root Locus
## 4. State Space Representation
Week 5: Digital PID Controller Design
- 6. Robust Control and H-infinity
      `.trim();

      const headings = extractOutlineHeadings(outline);
      expect(headings).toHaveLength(6);
      expect(headings[0]).toBe("Introduction to Feedback Control");
      expect(headings[1]).toBe("Frequency Domain Analysis & Transfer Functions");
      expect(headings[2]).toBe("Stability Criteria & Root Locus");
      expect(headings[3]).toBe("4. State Space Representation");
      expect(headings[4]).toBe("Digital PID Controller Design");
      expect(headings[5]).toBe("6. Robust Control and H-infinity");
    });

    it("returns empty array for empty or whitespace outline text", () => {
      expect(extractOutlineHeadings("")).toEqual([]);
      expect(extractOutlineHeadings("   \n\n  ")).toEqual([]);
    });
  });
});

