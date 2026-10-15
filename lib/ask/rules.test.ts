import { describe, it, expect } from "vitest";
import { validateQuestion, validateReply, canAccept, publicAuthor } from "./rules";

describe("ask rules", () => {
  it("validates length and links", () => {
    expect(validateQuestion("short").ok).toBe(false);
    expect(validateQuestion("How does photosynthesis make glucose?").ok).toBe(true);
    expect(validateQuestion("see http://a.com and http://b.com for this question").ok).toBe(false);
    expect(validateReply("a".repeat(2000)).ok).toBe(false);
    expect(validateReply("zzzzzzzzzzzzzzzzzzzz").ok).toBe(false);
  });
  it("only the asker accepts, never their own reply", () => {
    expect(canAccept("a", "a", "b")).toBe(true);
    expect(canAccept("a", "c", "b")).toBe(false);
    expect(canAccept("a", "a", "a")).toBe(false);
  });
  it("reveals the author uid only to admins", () => {
    expect(publicAuthor({ authorUid: "a" }, "b", false)).toEqual({ mine: false });
    expect(publicAuthor({ authorUid: "a" }, "b", true)).toEqual({ mine: false, authorUid: "a" });
  });
});
