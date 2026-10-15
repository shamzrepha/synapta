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
