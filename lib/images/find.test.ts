import { describe, expect, it } from "vitest";
import { titleMatch } from "./find";

describe("titleMatch", () => {
  it("is full when the title names the thing", () => {
    expect(titleMatch("light-emitting diode", "Red light emitting diode lit")).toBe(1);
  });
  it("accepts simple plurals", () => {
    expect(titleMatch("diode", "Several diodes on a board")).toBe(1);
  });
  it("is low when the title is about something else", () => {
    expect(titleMatch("sclera", "Man with sunglasses at the beach")).toBe(0);
  });
  it("is partial for partly named things", () => {
    expect(titleMatch("biliary obstruction", "Biliary tract diagram")).toBe(0.5);
  });
});
