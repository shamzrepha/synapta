import { describe, expect, it } from "vitest";
import { homeFor, hudPlacement, overlaps, type Box } from "./placement";

const W = 72;
const H = 81;
const bar = (vw: number, vh: number, h: number, bottom = 0): Box => ({ left: 12, right: vw - 12, top: vh - bottom - h, bottom: vh - bottom });

describe("homeFor", () => {
  it("waits in the bottom-right corner when nothing is in the way", () => {
    const p = homeFor(1280, 800, W, H, []);
    expect(p.x).toBe(1280 - W - 8);
    expect(p.y + H).toBe(800 - 24);
  });
  it("stands above the phone menu", () => {
    const nav: Box = { left: 0, right: 390, top: 844 - 64, bottom: 844 };
    const p = homeFor(390, 844, W, H, [nav]);
    expect(p.y + H).toBeLessThanOrEqual(nav.top - 8);
  });
  it("stands above the read-aloud bar and the menu under it", () => {
    const nav: Box = { left: 0, right: 390, top: 780, bottom: 844 };
    const player = bar(390, 844, 64, 76);
    const p = homeFor(390, 844, W, H, [nav, player]);
    const me: Box = { left: p.x, right: p.x + W, top: p.y, bottom: p.y + H };
    expect(overlaps(me, nav)).toBe(false);
    expect(overlaps(me, player)).toBe(false);
  });
  it("on a desktop it clears the player in the corner", () => {
    const player: Box = { left: 1280 - 24 - 384, right: 1280 - 24, top: 800 - 16 - 64, bottom: 800 - 16 };
    const p = homeFor(1280, 800, W, H, [player]);
    expect(overlaps({ left: p.x, right: p.x + W, top: p.y, bottom: p.y + H }, player)).toBe(false);
  });
  it("ignores bars that are not in its column or not at the bottom", () => {
    const topbar: Box = { left: 0, right: 1280, top: 0, bottom: 56 };
    const leftDock: Box = { left: 0, right: 300, top: 700, bottom: 800 };
    const p = homeFor(1280, 800, W, H, [topbar, leftDock]);
    expect(p.y + H).toBe(800 - 24);
  });
  it("never goes above the top of the screen", () => {
    const tall: Box = { left: 0, right: 400, top: 200, bottom: 400 };
    expect(homeFor(400, 400, W, H, [tall]).y).toBeGreaterThanOrEqual(6);
  });
});

describe("hudPlacement", () => {
  const sprout = (vw: number, vh: number): Box => {
    const p = homeFor(vw, vh, W, H, []);
    return { left: p.x, right: p.x + W, top: p.y, bottom: p.y + H };
  };
  it("opens above Sprout on a portrait phone and a desktop, never on top of it", () => {
    for (const [vw, vh] of [[360, 740], [390, 844], [412, 915], [1280, 800]]) {
      const b = sprout(vw, vh);
      const pl = hudPlacement(b, vw, vh);
      const hud: Box = { left: vw - pl.right - pl.width, right: vw - pl.right, bottom: vh - pl.bottom, top: vh - pl.bottom - pl.maxHeight };
      expect(overlaps(hud, b)).toBe(false);
      expect(hud.left).toBeGreaterThanOrEqual(0);
      expect(hud.right).toBeLessThanOrEqual(vw);
      expect(hud.top).toBeGreaterThanOrEqual(0);
    }
  });
  it("opens beside Sprout when the phone is on its side, inside the screen", () => {
    const vw = 568, vh = 320;
    const b = sprout(vw, vh);
    const pl = hudPlacement(b, vw, vh);
    const hud: Box = { left: vw - pl.right - pl.width, right: vw - pl.right, bottom: vh - pl.bottom, top: vh - pl.bottom - pl.maxHeight };
    expect(overlaps(hud, b)).toBe(false);
    expect(hud.left).toBeGreaterThanOrEqual(0);
    expect(hud.top).toBeGreaterThanOrEqual(0);
    expect(hud.bottom).toBeLessThanOrEqual(vh);
  });
  it("on its side it stays clear of the bottom menu and the player", () => {
    const vw = 568, vh = 320;
    const nav: Box = { left: 0, right: vw, top: vh - 64, bottom: vh };
    const player: Box = { left: 12, right: vw - 12, top: vh - 76 - 64, bottom: vh - 76 };
    const docks = [nav, player];
    const p = homeFor(vw, vh, W, H, docks);
    const b: Box = { left: p.x, right: p.x + W, top: p.y, bottom: p.y + H };
    const pl = hudPlacement(b, vw, vh, docks);
    const hud: Box = { left: vw - pl.right - pl.width, right: vw - pl.right, bottom: vh - pl.bottom, top: vh - pl.bottom - pl.maxHeight };
    expect(overlaps(hud, nav)).toBe(false);
    expect(overlaps(hud, player)).toBe(false);
    expect(overlaps(hud, b)).toBe(false);
    expect(hud.top).toBeGreaterThanOrEqual(0);
  });
  it("is never wider than the screen", () => {
    expect(hudPlacement(sprout(280, 600), 280, 600).width).toBeLessThanOrEqual(280);
  });
});
