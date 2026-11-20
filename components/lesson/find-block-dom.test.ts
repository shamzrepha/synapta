// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findBlockElement } from "./find-block";

describe("finding a block element", () => {
  it("finds a plain div, a blockquote and a heading", () => {
    const root = document.createElement("div");
    root.innerHTML =
      "<div>Water boils at one hundred degrees at sea level.</div><blockquote>Pressure changes the boiling point of water.</blockquote><h3>Evaporation basics</h3>";
    expect(findBlockElement(root, "Water boils at one hundred degrees")?.tagName).toBe("DIV");
    expect(findBlockElement(root, "Pressure changes the boiling point")?.tagName).toBe("BLOCKQUOTE");
    expect(findBlockElement(root, "Evaporation basics")?.tagName).toBe("H3");
  });
  it("returns null for bare text so the caller falls back to the topic, and does not open answers", () => {
    const root = document.createElement("div");
    root.innerHTML = '<button data-spoiler-toggle="closed">Reveal answers</button>';
    let clicked = false;
    root.querySelector("button")!.addEventListener("click", () => (clicked = true));
    expect(findBlockElement(root, "Nothing like this anywhere on the page")).toBeNull();
    expect(clicked).toBe(false);
  });
  it("walks to a spoken heading by its marker, even a very short one, or one drawn as a chip", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<span data-read-heading="">Circuits</span><h2 data-read-heading="">DC</h2><p>DC is direct current, flowing one way.</p><h3 data-read-heading="">Overview</h3>';
    expect(findBlockElement(root, "Circuits", true)?.tagName).toBe("SPAN");
    expect(findBlockElement(root, "DC", true)?.tagName).toBe("H2");
    expect(findBlockElement(root, "Overview", true)?.tagName).toBe("H3");
    expect(findBlockElement(root, "Nothing here", true)).toBeNull();
  });
});
