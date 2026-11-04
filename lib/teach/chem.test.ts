import { describe, it, expect } from "vitest";
import { countSide, isBalanced, parseFormula, subscripts } from "./chem";
import { parseCommons, isAllowedImageUrl } from "@/lib/images/commons";

describe("chemistry helper", () => {
  it("counts atoms, including brackets", () => {
    expect(parseFormula("H2O")).toEqual({ H: 2, O: 1 });
    expect(parseFormula("Ca(OH)2")).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(parseFormula("Al2(SO4)3")).toEqual({ Al: 2, S: 3, O: 12 });
    expect(parseFormula("h2o")).toBeNull();
    expect(parseFormula("")).toBeNull();
    expect(parseFormula("H2(O")).toBeNull();
  });
  it("tells balanced from unbalanced", () => {
    const r = [{ formula: "H2", coef: 2 }, { formula: "O2", coef: 1 }];
    expect(isBalanced(r, [{ formula: "H2O", coef: 2 }])).toBe(true);
    expect(isBalanced([{ formula: "H2", coef: 1 }, { formula: "O2", coef: 1 }], [{ formula: "H2O", coef: 1 }])).toBe(false);
    expect(countSide([{ formula: "NaCl", coef: 3 }])).toEqual({ Na: 3, Cl: 3 });
  });
  it("shows subscripts", () => {
    expect(subscripts("Ca(OH)2")).toBe("Ca(OH)₂");
  });
});

describe("picture search", () => {
  it("keeps only safe, licensed Commons pictures in search order", () => {
    const out = parseCommons({
      query: {
        pages: {
          "1": { index: 2, title: "File:Arduino Uno R3.jpg", imageinfo: [{ thumburl: "https://upload.wikimedia.org/a/b/c.jpg", mime: "image/jpeg", descriptionurl: "https://commons.wikimedia.org/wiki/File:A.jpg", extmetadata: { Artist: { value: '<a href="x">Jane &amp; Co</a>' }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] },
          "2": { index: 1, title: "File:Board.png", imageinfo: [{ thumburl: "https://upload.wikimedia.org/d.png", mime: "image/png", extmetadata: {} }] },
          "3": { index: 3, title: "File:Evil.jpg", imageinfo: [{ thumburl: "https://evil.example/x.jpg", mime: "image/jpeg" }] },
          "4": { index: 4, title: "File:Clip.ogv", imageinfo: [{ thumburl: "https://upload.wikimedia.org/v.ogv", mime: "video/ogg" }] },
        },
      },
    });
    expect(out.map((i) => i.title)).toEqual(["Board", "Arduino Uno R3"]);
    expect(out[1].author).toBe("Jane & Co");
    expect(out[1].license).toBe("CC BY-SA 4.0");
    expect(out[0].author).toBe("Unknown author");
    expect(parseCommons(null)).toEqual([]);
    expect(isAllowedImageUrl("https://upload.wikimedia.org/x.png")).toBe(true);
    expect(isAllowedImageUrl("https://upload.wikimedia.org.evil.com/x.png")).toBe(false);
    // Commons now serves resized pictures from thumb.wikimedia.org
    expect(isAllowedImageUrl("https://thumb.wikimedia.org/wikipedia/commons/thumb/d/de/A.jpg/960px-A.jpg?utm_source=commons.wikimedia.org")).toBe(true);
    expect(isAllowedImageUrl("https://thumb.wikimedia.org.evil.com/x.jpg")).toBe(false);
  });
});
