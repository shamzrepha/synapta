import { describe, it, expect } from "vitest";
import { landingRedirect, isCrawler } from "./landing-route";

const UA = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const base = { path: "/", hasSession: false, hasSeen: false, userAgent: UA };

describe("landingRedirect", () => {
  it("sends signed-in visitors to the dashboard", () => {
    expect(landingRedirect({ ...base, hasSession: true })).toBe("/dashboard");
    expect(landingRedirect({ ...base, hasSession: true, hasSeen: true })).toBe("/dashboard");
  });
  it("sends returning signed-out visitors to login", () => {
    expect(landingRedirect({ ...base, hasSeen: true })).toBe("/login");
  });
  it("shows the landing page to first-time visitors", () => {
    expect(landingRedirect(base)).toBeNull();
  });
  it("never redirects crawlers or link previews", () => {
    for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "facebookexternalhit/1.1", "WhatsApp/2.23", "Twitterbot/1.0", "Slackbot-LinkExpanding 1.0", "", null]) {
      expect(isCrawler(ua)).toBe(true);
      expect(landingRedirect({ ...base, hasSession: true, hasSeen: true, userAgent: ua })).toBeNull();
    }
    expect(isCrawler(UA)).toBe(false);
  });
  it("honours ?landing=1", () => {
    expect(landingRedirect({ ...base, hasSession: true, query: "?landing=1" })).toBeNull();
    expect(landingRedirect({ ...base, hasSeen: true, query: new URLSearchParams("landing=1") })).toBeNull();
    expect(landingRedirect({ ...base, hasSeen: true, query: "landing=0" })).toBe("/login");
  });
  it("only acts on / (no loops via /login, /dashboard or /about)", () => {
    for (const path of ["/login", "/dashboard", "/about", "/signup"]) {
      expect(landingRedirect({ ...base, path, hasSession: true, hasSeen: true })).toBeNull();
    }
  });
});
