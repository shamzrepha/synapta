import { describe, it, expect } from "vitest";
import { plainMathToLatex as f } from "./math-text";

describe("plainMathToLatex", () => {
  it("wraps powers and big-O calls", () => {
    expect(f("which results in O(n^2).")).toBe("which results in $O(n^2)$.");
    expect(f("complexity is O(n log n).")).toBe("complexity is $O(n \\log n)$.");
    expect(f("so n^2 grows")).toBe("so $n^2$ grows");
  });
  it("handles bracketed exponents and subscripts", () => {
    expect(f("= n^(log_2 2) = n^1")).toContain("$n^{log_2 2}$");
    expect(f("a value x_1 and x_2")).toBe("a value $x_1$ and $x_2$");
  });
  it("leaves existing maths, code and ordinary words alone", () => {
    expect(f("Use $T(n)=n^2$ here")).toBe("Use $T(n)=n^2$ here");
    expect(f("call `my_var` then")).toBe("call `my_var` then");
    expect(f("the file_name is fine")).toBe("the file_name is fine");
    expect(f("Plain sentence with no maths.")).toBe("Plain sentence with no maths.");
  });
});
