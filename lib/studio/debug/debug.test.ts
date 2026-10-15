import { describe, it, expect } from "vitest";
import { diagnosisSchema, normalizeDiagnosis, parseImageDataUrl } from "./schema";
import { cleanPartTypes, debugSystem, debugUserPrompt } from "./prompts";

const parse = (x: unknown) => diagnosisSchema.parse(x);
const cause = (title: string, likelihood: "high" | "medium" | "low", evidence: "photo" | "symptom" | "datasheet" = "photo") => ({ title, likelihood, evidence });

describe("normalizeDiagnosis", () => {
  it("never lets a blurry photo claim certainty or things seen", () => {
    const d = normalizeDiagnosis(parse({ photoQuality: "blurry", confidence: "high", seen: ["a red LED"], causes: [cause("LED backwards", "high")] }));
    expect(d.confidence).toBe("low");
    expect(d.seen).toEqual([]);
    expect(d.causes[0].evidence).toBe("symptom");
    expect(d.causes[0].likelihood).toBe("medium");
    expect(d.cannotSee.join(" ")).toMatch(/blurry/);
    expect(d.nextSteps.join(" ")).toMatch(/photo/i);
  });
  it("caps confidence at medium unless the photo is clear and the top cause is visible", () => {
    expect(normalizeDiagnosis(parse({ photoQuality: "usable", confidence: "high", causes: [cause("x", "high")] })).confidence).toBe("medium");
    expect(normalizeDiagnosis(parse({ photoQuality: "clear", confidence: "high", causes: [cause("x", "high", "symptom")] })).confidence).toBe("medium");
    expect(normalizeDiagnosis(parse({ photoQuality: "clear", confidence: "high", causes: [cause("x", "high", "photo")] })).confidence).toBe("high");
  });
  it("ranks causes most likely first and drops empty ones", () => {
    const d = normalizeDiagnosis(parse({ photoQuality: "clear", causes: [cause("c", "low"), cause("a", "high"), cause("b", "medium"), cause("  ", "high")] }));
    expect(d.causes.map((c) => c.title)).toEqual(["a", "b", "c"]);
  });
  it("with no cause it asks for more instead of guessing", () => {
    const d = normalizeDiagnosis(parse({ photoQuality: "clear", confidence: "high" }));
    expect(d.confidence).toBe("low");
    expect(d.nextSteps.length).toBeGreaterThan(0);
  });
  it("fills defaults for sloppy model output", () => {
    const d = parse({ causes: [{ title: "t" }] });
    expect(d.causes[0].test.tool).toBe("visual check");
    expect(d.photoQuality).toBe("usable");
  });
});

describe("image data url", () => {
  it("accepts jpeg/png/webp base64 and rejects the rest", () => {
    expect(parseImageDataUrl("data:image/jpeg;base64,AAAA")).toEqual({ mimeType: "image/jpeg", data: "AAAA" });
    expect(parseImageDataUrl("data:image/svg+xml;base64,AAAA")).toBeNull();
    expect(parseImageDataUrl("data:image/png;base64,<script>")).toBeNull();
    expect(parseImageDataUrl("data:image/png;base64," + "A".repeat(2_000_000))).toBeNull();
  });
});

describe("grounding prompts", () => {
  it("includes datasheet facts only for named shop parts and fences user text", () => {
    const types = cleanPartTypes(["relay", "relay", "flux_capacitor", "dht11"]);
    expect(types).toEqual(["relay", "dht11"]);
    expect(debugSystem(types)).toContain("Pull-in voltage");
    expect(debugSystem([])).toContain("did not name any parts");
    const u = debugUserPrompt("it does not light", "", types);
    expect(u).toContain("<USER_INPUT>");
    expect(u.indexOf("it does not light")).toBeGreaterThan(u.indexOf("<USER_INPUT>"));
  });
});
