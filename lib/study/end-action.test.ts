import { describe, it, expect } from "vitest";
import { pickEndAction } from "./end-action";

describe("pickEndAction", () => {
  it("leads with the quiz when nothing has been practised", () => {
    expect(pickEndAction({ recallFinished: false, recallPassed: false, hasPractice: true, hasNext: true })).toBe("quiz");
  });
  it("still leads with the quiz after a good self-check, because it is only a confidence signal", () => {
    expect(pickEndAction({ recallFinished: true, recallPassed: true, hasPractice: true, hasNext: true })).toBe("quiz");
  });
  it("leads with reviewing the tricky parts after a weak recall", () => {
    expect(pickEndAction({ recallFinished: true, recallPassed: false, hasPractice: true, hasNext: true })).toBe("review-tricky");
  });
  it("moves on when there is no practice for the topic", () => {
    expect(pickEndAction({ recallFinished: false, recallPassed: false, hasPractice: false, hasNext: true })).toBe("next");
    expect(pickEndAction({ recallFinished: false, recallPassed: false, hasPractice: false, hasNext: false })).toBe("none");
  });
});
