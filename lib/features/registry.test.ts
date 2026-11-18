import { describe, it, expect } from "vitest";
import { FEATURES } from "./registry";

describe("feature registry", () => {
  it("gives every feature its own id and number (the hub uses them as React keys)", () => {
    const ids = FEATURES.map((f) => f.id);
    const nums = FEATURES.map((f) => f.n);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(nums.filter((n, i) => nums.indexOf(n) !== i)).toEqual([]);
  });
});
