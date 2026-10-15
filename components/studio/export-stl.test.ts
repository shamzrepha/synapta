import { describe, it, expect } from "vitest";
import { buildStl } from "./export-stl";
import type { ResolvedPart } from "@/lib/studio/spec";

const box = (id: string, pos: [number, number, number], size = [10, 20, 30]): ResolvedPart => ({ id, name: id, shape: "box", size, pos });

describe("STL export", () => {
  it("writes a binary STL with 12 triangles per box, in mm, resting on z = 0", () => {
    const { data, triangles } = buildStl([box("a", [0, 0, 0]), box("b", [50, 0, 0])]);
    expect(triangles).toBe(24);
    expect(data.byteLength).toBe(84 + 24 * 50);
    // the lowest z of every vertex is 0 (sits on the build plate)
    const dv = new DataView(data);
    let minZ = Infinity;
    let maxX = -Infinity;
    for (let t = 0; t < triangles; t++) {
      const base = 84 + t * 50 + 12;
      for (let v = 0; v < 3; v++) {
        maxX = Math.max(maxX, dv.getFloat32(base + v * 12, true));
        minZ = Math.min(minZ, dv.getFloat32(base + v * 12 + 8, true));
      }
    }
    expect(minZ).toBeCloseTo(0, 3);
    expect(maxX).toBeCloseTo(55, 3);
  });

  it("handles an empty design", () => {
    expect(buildStl([]).triangles).toBe(0);
  });
});
