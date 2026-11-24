import { describe, expect, it } from "vitest";
import { summarise } from "./summary";

describe("ambassador totals", () => {
  it("splits money into held, payable and paid", () => {
    const now = 1_000_000;
    const t = summarise(
      [
        { commissionNgn: 300, status: "held", payableAtMs: now + 5 },
        { commissionNgn: 900, status: "held", payableAtMs: now - 5 },
        { commissionNgn: 450, status: "paid", payableAtMs: 0 },
        { commissionNgn: 999, status: "void", payableAtMs: 0 },
      ],
      now,
    );
    expect(t).toEqual({ held: 300, payable: 900, paid: 450, lifetime: 1_650 });
  });
});
