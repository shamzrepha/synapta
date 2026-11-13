import { describe, expect, it } from "vitest";
import { hopMs, hopPath, perchOnWord } from "./read-hop";
import { SPROUT_H, SPROUT_W } from "./swing";

describe("Sprout hopping along the words", () => {
  const vp = { width: 390, height: 800 };
  it("stands centred on top of the word and stays on screen", () => {
    const p = perchOnWord({ left: 100, top: 300, width: 60, height: 20 }, vp);
    expect(p.x).toBeCloseTo(130 - SPROUT_W / 2);
    expect(p.y).toBeCloseTo(300 - SPROUT_H + 10);
    expect(perchOnWord({ left: 0, top: 0, width: 20, height: 20 }, vp)).toEqual({ x: 4, y: 4 });
    expect(perchOnWord({ left: 380, top: 790, width: 30, height: 20 }, vp).x).toBeLessThanOrEqual(vp.width - SPROUT_W - 4);
  });

  it("hops with a smooth arc: starts and lands exactly, rises in between, never snaps", () => {
    const f = hopPath({ x: 10, y: 200 }, { x: 90, y: 200 });
    expect(f(0)).toEqual({ x: 10, y: 200 });
    expect(f(1).x).toBeCloseTo(90);
    expect(f(1).y).toBeCloseTo(200);
    expect(f(0.5).y).toBeLessThan(200);
    let prev = f(0);
    for (let i = 1; i <= 40; i++) {
      const p = f(i / 40);
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(12);
      prev = p;
    }
  });

  it("takes a moment to hop, longer for a new line, and never longer than the voice allows", () => {
    expect(hopMs({ x: 0, y: 0 }, { x: 40, y: 0 }, 400)).toBeGreaterThanOrEqual(150);
    expect(hopMs({ x: 0, y: 0 }, { x: 300, y: 28 }, 900)).toBeGreaterThan(hopMs({ x: 0, y: 0 }, { x: 40, y: 0 }, 900));
    expect(hopMs({ x: 0, y: 0 }, { x: 300, y: 0 }, 100)).toBeLessThanOrEqual(620);
    // a long hop across the page is never a dash: at most about 1.1 px per millisecond
    const far = { x: 330, y: 30 };
    expect(Math.hypot(far.x, far.y) / hopMs({ x: 0, y: 0 }, far, 90)).toBeLessThanOrEqual(1.15);
  });
});
