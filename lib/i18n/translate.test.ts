import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: vi.fn(), Timestamp: { now: () => ({}) } }));
vi.mock("@/lib/ai/router", () => ({ generateWithFallback: vi.fn() }));

import { applyStrings, collectStrings, isTranslatable } from "./translate";
import { isUiText, withSpacing } from "./dom";

describe("which content strings get translated", () => {
  it("translates words for people and keeps data", () => {
    expect(isTranslatable("Ohm's law relates voltage, current and resistance.")).toBe(true);
    expect(isTranslatable("multiple_choice")).toBe(false);
    expect(isTranslatable("kcId")).toBe(false);
    expect(isTranslatable("https://example.com/a")).toBe(false);
    expect(isTranslatable("42")).toBe(false);
    expect(isTranslatable("<!doctype html><html><body><div>" + "x".repeat(300) + "</div></body></html>")).toBe(false);
    expect(isTranslatable("void setup() { pinMode(13, OUTPUT); }")).toBe(false);
  });

  it("walks a lesson payload, skipping ids, enums and code fields", () => {
    const payload = {
      id: "kc_1",
      title: "Ohm's law",
      lessonMarkdown: "## What is current?\nCurrent is the flow of charge.",
      difficulty: "medium",
      labs: [{ id: "lab1", title: "Build a circuit", code: "void loop() {}", published: true }],
      questions: [{ question: "What is V = IR?", options: ["Ohm's law", "Newton's law"], correctIndex: 0 }],
      createdAt: { toMillis: () => 1 },
    };
    const found = collectStrings(payload);
    expect([...found].sort()).toEqual(["Build a circuit", "Newton's law", "Ohm's law", "What is V = IR?", "## What is current?\nCurrent is the flow of charge."].sort());
    const map = new Map([...found].map((s) => [s, `YO:${s}`]));
    const out = applyStrings(payload, map);
    expect(out.title).toBe("YO:Ohm's law");
    expect(out.id).toBe("kc_1");
    expect(out.difficulty).toBe("medium");
    expect(out.labs[0].code).toBe("void loop() {}");
    expect(out.labs[0].published).toBe(true);
    expect(out.questions[0].options).toEqual(["YO:Ohm's law", "YO:Newton's law"]);
    expect(out.questions[0].correctIndex).toBe(0);
    expect(out.createdAt).toBe(payload.createdAt);
  });
});

describe("interface text", () => {
  it("picks labels and leaves numbers, addresses and identifiers", () => {
    expect(isUiText("Start learning")).toBe(true);
    expect(isUiText("12 XP")).toBe(false);
    expect(isUiText("3/10")).toBe(false);
    expect(isUiText("@shamaryah")).toBe(false);
    expect(isUiText("onClick")).toBe(false);
    expect(isUiText("x")).toBe(false);
  });
  it("keeps the spaces around a translated label", () => {
    expect(withSpacing("  Save ", "Fipamọ́")).toBe("  Fipamọ́ ");
  });
});
