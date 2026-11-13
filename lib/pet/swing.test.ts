import { describe, expect, it } from "vitest";
import { ANCHOR_HAND, SPROUT_W, climbMs, planSwing, samplePath, smoothstep } from "./swing";

const phone = { viewportWidth: 390, minHandX: 6 + SPROUT_W * ANCHOR_HAND.x, maxHandX: 390 - 6 - SPROUT_W * (1 - ANCHOR_HAND.x) };
const base = { ...phone, start: { x: 200, y: 230 }, land: { x: 40, y: 420 } };

describe("swing plan", () => {
  it("ends exactly on the landing spot", () => {
    const plan = planSwing(base);
    const end = plan.handAt(1);
    expect(end.x).toBeCloseTo(base.land.x, 6);
    expect(end.y).toBeCloseTo(base.land.y, 6);
  });

  it("climbs straight up the rope: the hanging spot is on the line from the start to the hook, well above the start", () => {
    for (const startY of [230, 400, 600]) {
      const plan = planSwing({ ...base, start: { x: 200, y: startY } });
      expect(plan.hang.y).toBeLessThanOrEqual(startY - 59);
      // on the rope: start, hang and hook line up
      const cross = (plan.hang.x - 200) * (plan.hook.y - startY) - (plan.hang.y - startY) * (plan.hook.x - 200);
      expect(Math.abs(cross)).toBeLessThan(1);
      // and the rope got shorter
      expect(Math.hypot(plan.hang.x - plan.hook.x, plan.hang.y - plan.hook.y)).toBeLessThan(Math.hypot(200 - plan.hook.x, startY - plan.hook.y));
    }
  });

  it("keeps a rope of a believable length and fixes the hook at the top edge", () => {
    const plan = planSwing(base);
    expect(plan.hook.y).toBeLessThanOrEqual(2);
    expect(plan.radiusFrom).toBeGreaterThanOrEqual(60);
    // the rope is taut the whole swing: its length changes smoothly (it is reeled), never jumps
    let prev = plan.radiusFrom;
    for (let i = 1; i <= 50; i++) {
      const p = plan.handAt(i / 50);
      const len = Math.hypot(p.x - plan.hook.x, p.y - plan.hook.y);
      expect(Math.abs(len - prev)).toBeLessThan(12);
      prev = len;
    }
  });

  it("swings in from the side with more room and never leaves the screen", () => {
    const left = planSwing(base);
    expect(left.handAt(0).x).toBeGreaterThan(base.land.x);
    const right = planSwing({ ...base, land: { x: 300, y: 420 } });
    expect(right.handAt(0).x).toBeLessThan(300);
    for (const plan of [left, right]) {
      for (let i = 0; i <= 40; i++) {
        const p = plan.handAt(i / 40);
        expect(p.x).toBeGreaterThanOrEqual(phone.minHandX - 1);
        expect(p.x).toBeLessThanOrEqual(phone.maxHandX + 1);
      }
    }
  });

  it("starts and ends at rest (slow at both ends, fastest at the bottom)", () => {
    const plan = planSwing(base);
    const d = (a: number, b: number) => Math.hypot(plan.handAt(b).x - plan.handAt(a).x, plan.handAt(b).y - plan.handAt(a).y);
    expect(d(0, 0.05)).toBeLessThan(d(0.45, 0.5));
    expect(d(0.95, 1)).toBeLessThan(d(0.45, 0.5));
  });

  it("gives a very high landing a real rope by putting the hook above the screen", () => {
    const plan = planSwing({ ...base, land: { x: 40, y: 60 }, start: { x: 200, y: 500 } });
    expect(plan.radiusTo).toBeGreaterThanOrEqual(150);
    expect(plan.hook.y).toBeLessThan(0);
  });

  it("lands barely below its lowest point, so it never dips into the card", () => {
    const plan = planSwing(base);
    let lowest = 0;
    for (let i = 0; i <= 100; i++) lowest = Math.max(lowest, plan.handAt(i / 100).y);
    expect(lowest - base.land.y).toBeLessThan(8);
  });

  it("samples a path and sizes the climb", () => {
    const pts = samplePath((u) => ({ x: u * 100, y: 0 }), 10);
    expect(pts).toHaveLength(11);
    expect(pts[10].x).toBe(100);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(climbMs(0)).toBe(900);
    expect(climbMs(2000)).toBe(1500);
  });
});
