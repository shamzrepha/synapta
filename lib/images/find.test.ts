import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findBestImages, titleMatch } from "./find";

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

describe("findBestImages", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("drops noisy logos/flags and ranks matching diagram higher in diagram filter", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("en.wikipedia.org/api/rest_v1/page/summary")) {
        return new Response(
          JSON.stringify({
            title: "Mitochondrion",
            thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Mitochondrion_mini.svg/400px-Mitochondrion_mini.svg.png" },
            content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Mitochondrion" } },
          }),
          { status: 200 }
        );
      }
      if (url.includes("commons.wikimedia.org/w/api.php")) {
        return new Response(
          JSON.stringify({
            query: {
              pages: {
                "1": {
                  title: "File:Mitochondrion official logo badge.png",
                  imageinfo: [
                    {
                      url: "https://upload.wikimedia.org/wikipedia/commons/b/logo.png",
                      mime: "image/png",
                      width: 600,
                      height: 600,
                      descriptionurl: "https://commons.wikimedia.org/wiki/File:Logo",
                      extmetadata: { Artist: { value: "A" }, LicenseShortName: { value: "CC-BY" } },
                    },
                  ],
                },
                "2": {
                  title: "File:Mitochondrion labeled cross-section diagram.svg",
                  imageinfo: [
                    {
                      url: "https://upload.wikimedia.org/wikipedia/commons/c/mito_diagram.svg",
                      mime: "image/svg+xml",
                      width: 800,
                      height: 500,
                      descriptionurl: "https://commons.wikimedia.org/wiki/File:Mito_diagram.svg",
                      extmetadata: { Artist: { value: "Bio" }, LicenseShortName: { value: "CC0" } },
                    },
                  ],
                },
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });

    const pics = await findBestImages({
      term: "mitochondrion",
      topic: "cell biology",
      filter: "diagram",
    });

    expect(pics.some((p) => /logo/i.test(p.title))).toBe(false);
    expect(pics.some((p) => p.url.endsWith("mito_diagram.svg"))).toBe(true);
    // Diagram mode does not query Openverse photos
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("api.openverse.org"))).toBe(false);
  });

  it("excludes SVG files when photo filter is active", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("en.wikipedia.org")) {
        return new Response(
          JSON.stringify({
            title: "Ohm's law",
            thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/o/Ohms_law.svg" },
          }),
          { status: 200 }
        );
      }
      if (url.includes("commons.wikimedia.org")) {
        return new Response(
          JSON.stringify({
            query: {
              pages: {
                "1": {
                  title: "File:Ohms law vector.svg",
                  imageinfo: [{ url: "https://upload.wikimedia.org/wikipedia/commons/o/v.svg", width: 500, height: 400 }],
                },
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          results: [
            {
              url: "https://live.staticflickr.com/resistor_ohms_law.jpg",
              title: "Ohm's law resistor breadboard setup",
              creator: "Lab",
              license: "cc-by",
              license_version: "4.0",
              foreign_landing_url: "https://openverse.org/1",
            },
          ],
        }),
        { status: 200 }
      );
    });

    const pics = await findBestImages({ term: "Ohm's law", filter: "photo" });
    expect(pics.every((p) => !/\.svg(\?|$)/i.test(p.url))).toBe(true);
    expect(pics.some((p) => p.source === "openverse")).toBe(true);
  });
});
