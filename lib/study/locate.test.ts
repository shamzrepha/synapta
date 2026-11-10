import { describe, expect, it } from "vitest";
import { rankBlocks, toBlocks, tokens } from "./locate";

const LESSON = `# LEDs
## Basics
An LED is a diode that emits light when current flows forward.

## Wiring
Always add a current-limiting resistor in series with the LED.
- The anode is the longer leg.
- The cathode is the shorter leg.

\`\`\`
# not a heading
\`\`\``;

describe("locate", () => {
  it("drops stop words and short tokens", () => {
    expect(tokens("What is the anode of an LED?")).toEqual(["anode", "led"]);
  });
  it("splits into blocks with their heading", () => {
    const b = toBlocks(LESSON);
    expect(b.find((x) => x.text.includes("longer leg"))?.heading).toBe("Wiring");
    expect(b.some((x) => x.text.includes("not a heading"))).toBe(false);
  });
  it("finds the block that explains an answer", () => {
    const r = rankBlocks(LESSON, "Which leg is the anode? The longer leg");
    expect(r[0].text).toContain("anode is the longer leg");
    expect(r[0].heading).toBe("Wiring");
  });
  it("returns nothing when nothing matches", () => {
    expect(rankBlocks(LESSON, "quantum chromodynamics gluons")).toEqual([]);
  });
});
