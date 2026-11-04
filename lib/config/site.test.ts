import { describe, it, expect } from "vitest";
import { parseSite, DEFAULT_SITE, DEFAULT_PAUSE_MESSAGE } from "./site";

describe("site config", () => {
  it("everything is on when nothing is saved or the data is odd", () => {
    expect(parseSite(undefined)).toEqual(DEFAULT_SITE);
    expect(parseSite("nonsense")).toEqual(DEFAULT_SITE);
    expect(parseSite({ aiPaused: "yes" }).aiPaused).toBe(false);
  });
  it("only a real true pauses AI", () => {
    expect(parseSite({ aiPaused: true }).aiPaused).toBe(true);
  });
  it("trims and caps the notice and keeps a default pause message", () => {
    const c = parseSite({ noticeText: `  ${"x".repeat(500)}  `, noticeLevel: "warning", aiPausedMessage: "   " });
    expect(c.notice?.text.length).toBe(240);
    expect(c.notice?.level).toBe("warning");
    expect(c.aiPausedMessage).toBe(DEFAULT_PAUSE_MESSAGE);
  });
  it("an empty notice means no banner, and an unknown level is info", () => {
    expect(parseSite({ noticeText: "   " }).notice).toBeNull();
    expect(parseSite({ noticeText: "hi", noticeLevel: "danger" }).notice?.level).toBe("info");
  });
});
