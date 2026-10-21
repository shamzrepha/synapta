import { describe, expect, it } from "vitest";
import { splitForSpeech } from "./audio";

describe("splitForSpeech", () => {
  it("keeps a short line as one piece", () => {
    expect(splitForSpeech("A capacitor stores charge.")).toEqual(["A capacitor stores charge."]);
  });

  it("splits a long lecture line at sentence boundaries into pieces under the limit, losing no words", () => {
    const sentence = "A capacitor stores energy in an electric field between two plates, and the voltage across it cannot change instantly.";
    const text = Array.from({ length: 6 }, () => sentence).join(" ");
    const parts = splitForSpeech(text, 320);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(320);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(text);
  });

  it("cuts a single very long sentence at commas or spaces", () => {
    const text = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ") + ".";
    const parts = splitForSpeech(text, 100);
    expect(parts.length).toBeGreaterThan(3);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(101);
    expect(parts.join(" ").split(/\s+/).length).toBe(80);
  });
});
