import { describe, expect, it } from "vitest";
import { OFFER_PAUSE_MS, parseReadPace, shouldOfferReadAlong, type OfferInput } from "./read-offer";

const base: OfferInput = { botEnabled: true, offerOn: true, hasReadableText: true, voiceIdle: true, mode: "flip", scrollY: 0, now: 1_000_000, lastOfferAt: 0, lastActiveAt: 0 };

describe("read-along offer", () => {
  it("offers on the first open of the session", () => expect(shouldOfferReadAlong(base)).toBe(true));
  it("does not offer again straight away, but does after a long pause", () => {
    expect(shouldOfferReadAlong({ ...base, lastOfferAt: 900_000, lastActiveAt: 990_000 })).toBe(false);
    expect(shouldOfferReadAlong({ ...base, lastOfferAt: 1, lastActiveAt: 1_000_000 - OFFER_PAUSE_MS })).toBe(true);
  });
  it("respects Sprout off, Don't ask again, no text and a voice already reading", () => {
    expect(shouldOfferReadAlong({ ...base, botEnabled: false })).toBe(false);
    expect(shouldOfferReadAlong({ ...base, offerOn: false })).toBe(false);
    expect(shouldOfferReadAlong({ ...base, hasReadableText: false })).toBe(false);
    expect(shouldOfferReadAlong({ ...base, voiceIdle: false })).toBe(false);
  });
  it("in scroll mode stays quiet when the learner is already mid-reading", () => {
    expect(shouldOfferReadAlong({ ...base, mode: "scroll", scrollY: 900 })).toBe(false);
    expect(shouldOfferReadAlong({ ...base, mode: "scroll", scrollY: 20 })).toBe(true);
  });
  it("maps the pace to playback rates and falls back to normal", () => {
    expect([0.85, 1, 1.25].map(parseReadPace)).toEqual([0.85, 1, 1.25]);
    expect(parseReadPace(3)).toBe(1);
    expect(parseReadPace(undefined)).toBe(1);
  });
});
