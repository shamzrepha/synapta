import { describe, expect, it } from "vitest";
import { commissionFor, tierFor } from "./commission";

describe("ambassador commission", () => {
  it("pays 20% of a first payment to a new ambassador", () => {
    expect(commissionFor(1_500, 1, 0)).toBe(300);
    expect(commissionFor(4_500, 1, 9)).toBe(900);
  });
  it("pays more as they bring more paying students", () => {
    expect(tierFor(10).name).toBe("Silver");
    expect(commissionFor(4_500, 1, 10)).toBe(1_125);
    expect(commissionFor(4_500, 1, 30)).toBe(1_350);
  });
  it("pays a flat 10% on the next six payments and nothing after", () => {
    expect(commissionFor(1_500, 2, 50)).toBe(150);
    expect(commissionFor(1_500, 7, 50)).toBe(150);
    expect(commissionFor(1_500, 8, 50)).toBe(0);
  });
  it("pays nothing for a zero payment", () => {
    expect(commissionFor(0, 1, 0)).toBe(0);
  });
});
