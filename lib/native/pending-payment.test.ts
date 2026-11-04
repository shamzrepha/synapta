// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { savePending, readPending, clearPending } from "./pending-payment";

describe("pending payment", () => {
  beforeEach(() => localStorage.clear());
  it("remembers a reference and forgets it when cleared", () => {
    savePending("sr_abc12345_x_y", 1000);
    expect(readPending(2000)?.reference).toBe("sr_abc12345_x_y");
    clearPending();
    expect(readPending(2000)).toBeNull();
  });
  it("drops one older than an hour", () => {
    savePending("sr_abc12345_x_y", 0);
    expect(readPending(61 * 60 * 1000)).toBeNull();
  });
  it("ignores a tampered value", () => {
    localStorage.setItem("sunroot:pendingPayment", JSON.stringify({ reference: "../../x", at: Date.now() }));
    expect(readPending()).toBeNull();
  });
});
