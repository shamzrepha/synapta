import { describe, it, expect } from "vitest";
import { GRAPHIC, isOpenLicense, parseCommons, pickBest, pictureTerm, searchCommons } from "./images";
import { buildImageActivities, groundActivity } from "./activities";
import { emptyLibrary, stableId, type KnowledgeUnit } from "./types";

const page = (title: string, license: string, desc = "", mime = "image/jpeg", thumb = "https://upload.wikimedia.org/x/640px-a.jpg") => ({
  title,
  imageinfo: [{ thumburl: thumb, thumbwidth: 640, thumbheight: 480, descriptionurl: "https://commons.wikimedia.org/wiki/File:a.jpg", mime, extmetadata: { LicenseShortName: { value: license }, Artist: { value: "<a href='x'>Jane Doe</a>" }, ImageDescription: { value: desc } } }],
});
const json = (...pages: unknown[]) => ({ query: { pages: Object.fromEntries(pages.map((p, i) => [String(i), p])) } });

describe("web pictures", () => {
  it("keeps open licences with credit, drops closed licences, other hosts and non-photos", () => {
    const r = parseCommons(json(page("File:Jaundice eyes.jpg", "CC BY-SA 4.0"), page("File:Closed.jpg", "All rights reserved"), page("File:Gif.gif", "CC0", "", "image/gif"), page("File:Other.jpg", "CC0", "", "image/jpeg", "https://evil.example/a.jpg"), page("File:PD.jpg", "Public domain")));
    expect(r.map((x) => x.title)).toEqual(["Jaundice eyes", "PD"]);
    expect(r[0].author).toBe("Jane Doe");
    expect(isOpenLicense("CC BY 3.0")).toBe(true);
    expect(isOpenLicense("Fair use")).toBe(false);
  });
  it("skips anything that looks graphic", () => {
    const r = parseCommons(json(page("File:Open surgery wound.jpg", "CC0"), page("File:Jaundice skin.jpg", "CC0", "a patient with a gunshot injury"), page("File:Jaundice sclera.jpg", "CC0", "yellow eyes")));
    expect(r.map((x) => x.title)).toEqual(["Jaundice sclera"]);
    expect(GRAPHIC.test("normal anatomy diagram")).toBe(false);
  });
  it("only cues facts that name something visible, and picks a decent picture", () => {
    expect(pictureTerm({ type: "sign_symptom", answer: "Jaundice" })).toBe("Jaundice");
    expect(pictureTerm({ type: "rule", answer: "Jaundice" })).toBeNull();
    expect(pictureTerm({ type: "sign_symptom", answer: "yellowing of the skin and eyes from raised bilirubin" })).toBeNull();
    const c = parseCommons(json(page("File:a.jpg", "CC0")));
    expect(pickBest(c)).toBeTruthy();
    expect(pickBest([])).toBeNull();
  });
  it("a failed or offline search returns nothing instead of crashing", async () => {
    expect(await searchCommons("jaundice", (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toEqual([]);
    expect(await searchCommons("jaundice", (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch)).toEqual([]);
    expect(await searchCommons("ab")).toEqual([]);
  });
  it("an approved picture becomes a grounded question whose answer comes from her notes", () => {
    const lib = emptyLibrary();
    const mk = (s: string, a: string): KnowledgeUnit => ({ id: stableId("ku", s), conceptId: "c", type: "sign_symptom", statement: s, question: `Which sign: ${s}`, answer: a, source: { docId: "d", pageNo: 1, lineStart: 1, lineEnd: 1, excerpt: s }, alsoIn: [], provenance: "notes", confidence: 0.9, status: "active", tags: [] });
    ["Jaundice is yellowing of the skin.", "Cyanosis is a blue tint to the lips.", "Pallor is a pale skin colour.", "Clubbing is widening of the fingertips."].forEach((s, i) => { const u = mk(s, ["Jaundice", "Cyanosis", "Pallor", "Clubbing"][i]); lib.units[u.id] = u; });
    const target = Object.values(lib.units)[0];
    const [a] = buildImageActivities(lib, [{ kuId: target.id, url: "https://upload.wikimedia.org/x/640px-a.jpg", credit: "Jane Doe", license: "CC BY 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:a.jpg" }]);
    expect(a.options[a.correctIndex]).toBe("Jaundice");
    const text = () => "Jaundice is yellowing of the skin.";
    expect(groundActivity(a, lib, text).ok).toBe(true);
    expect(groundActivity({ ...a, image: { ...a.image, url: "https://evil.example/x.jpg" } }, lib, text).ok).toBe(false);
  });
});
