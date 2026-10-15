import { describe, it, expect } from "vitest";
import { extractMentions, extractHashtags, linkifySocial } from "./text";

describe("social text", () => {
  it("finds mentions and hashtags, deduped and lowercased", () => {
    const t = "Thanks @Amara_O and @kofi! Studying #Physics with #physics and #OhmsLaw";
    expect(extractMentions(t)).toEqual(["amara_o", "kofi"]);
    expect(extractHashtags(t)).toEqual(["physics", "ohmslaw"]);
  });

  it("ignores emails, numbers, code and maths", () => {
    const t = "mail me a@b.com, issue #12, `#define X`, $a\\#b$ and real #tag";
    expect(extractMentions(t)).toEqual([]);
    expect(extractHashtags(t)).toEqual(["tag"]);
  });

  it("links mentions and tags without touching code", () => {
    expect(linkifySocial("hi @kofi see #Physics `#notatag`")).toBe("hi [@kofi](/u/kofi) see [#Physics](/feed?tag=physics) `#notatag`");
  });
});

import { activeToken, applySuggestion } from "./text";
describe("autocomplete tokens", () => {
  it("finds the @ or # being typed at the caret", () => {
    expect(activeToken("hello @ab", 9)).toEqual({ kind: "@", query: "ab", start: 6 });
    expect(activeToken("#phy", 4)).toEqual({ kind: "#", query: "phy", start: 0 });
    expect(activeToken("see #", 5)).toEqual({ kind: "#", query: "", start: 4 });
    expect(activeToken("mail me@site.com", 16)).toBeNull();
    expect(activeToken("done @ab ", 9)).toBeNull();
  });
  it("inserts the chosen value and moves the caret", () => {
    const t = activeToken("hi @jo there", 6)!;
    expect(applySuggestion("hi @jo there", 6, t, "john_k")).toEqual({ text: "hi @john_k there", caret: 11 });
    expect(applySuggestion("hi @jo", 6, activeToken("hi @jo", 6)!, "john_k")).toEqual({ text: "hi @john_k ", caret: 11 });
  });
});
