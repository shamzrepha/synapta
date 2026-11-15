import { describe, it, expect } from "vitest";
import { LAB_CLEAN_TEXT_JS, LAB_VIEW_JS, SIM_HEAD_INJECT, withDisplayPatch } from "./inject";
import { readableText } from "@/lib/text/readable";

const clean = new Function(`${LAB_CLEAN_TEXT_JS}; return sunrootClean;`)() as (s: string) => string;

describe("lab display patch", () => {
  it("cleans the exact text seen in the screenshot", () => {
    expect(clean("Active: $V_{out} = \\alpha \\cdot \\Delta T$ (Self-generating)")).toBe("Active: V_out = α · Δ T (Self-generating)");
    expect(clean("Passive: $V_{out} = V_{exc} \\cdot \\frac{R(T)}{R(T) + R_{ref}}$")).toBe("Passive: V_out = V_exc · (R(T))/(R(T) + R_ref)");
    expect(clean("MEASURAND ($T$)")).toBe("MEASURAND (T)");
    expect(clean("TERMINAL VOLTAGE ($V_{OUT}$)")).toBe("TERMINAL VOLTAGE (V_OUT)");
  });
  it("leaves ordinary text and prices alone", () => {
    expect(clean("Costs $5 and $6 today")).toBe("Costs $5 and $6 today");
    expect(clean("Both transducers generate normal signals")).toBe("Both transducers generate normal signals");
  });
  it("agrees with the server-side cleaner on common cases", () => {
    for (const s of ["F = m \\times a", "E = mc^{2}", "x_{1} + x_{2}", "\\sqrt{x}", "**bold** and `code`"]) {
      expect(clean(s)).toBe(readableText(s));
    }
  });
  it("is added once, after the host injection", () => {
    const html = `<!DOCTYPE html><html><head>${SIM_HEAD_INJECT}</head><body></body></html>`;
    const once = withDisplayPatch(html);
    expect(once.indexOf("sunroot-fit")).toBeGreaterThan(once.indexOf(SIM_HEAD_INJECT));
    expect(withDisplayPatch(once)).toBe(once);
  });
});

describe("look-around tools for 2D labs (zoom, move, fit)", () => {
  it("is valid script that does nothing outside a browser page it can use", () => {
    expect(() => new Function(LAB_VIEW_JS)).not.toThrow();
  });
  it("is part of the patch every lab gets, once, and lets the page scroll", () => {
    const patched = withDisplayPatch(`<!DOCTYPE html><html><head>${SIM_HEAD_INJECT}</head><body><svg></svg></body></html>`);
    expect(patched.split('id="sunroot-view"').length - 1).toBe(1);
    expect(patched).toContain("overflow-y:auto!important");
    expect(patched).toContain("Zoom in");
  });
  it("leaves 3D labs alone (they have their own orbit and zoom)", () => {
    expect(LAB_VIEW_JS).toContain("window.SimKit3D");
  });
});
