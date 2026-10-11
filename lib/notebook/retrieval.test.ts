import { describe, it, expect } from "vitest";
import { tokenize, chunkText, chunkPages, retrieveRelevantChunks } from "./retrieval";

describe("Notebook Retrieval Engine", () => {
  it("tokenizes text correctly and filters stopwords", () => {
    const text = "The electrical voltage in an ohmic circuit is proportional to current.";
    const tokens = tokenize(text);

    expect(tokens).toContain("electrical");
    expect(tokens).toContain("voltage");
    expect(tokens).toContain("ohmic");
    expect(tokens).toContain("circuit");
    expect(tokens).toContain("proportional");
    expect(tokens).toContain("current");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("in");
    expect(tokens).not.toContain("an");
    expect(tokens).not.toContain("is");
  });

  it("chunks text into overlapping segments with IDs", () => {
    const longText =
      "Ohm's Law states that current is proportional to voltage and inversely proportional to resistance. ".repeat(
        15
      );

    const chunks = chunkText("source-1", "Circuits Chapter 1", longText, 300, 50);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].sourceId).toBe("source-1");
    expect(chunks[0].sourceTitle).toBe("Circuits Chapter 1");
    expect(chunks[0].tokens.length).toBeGreaterThan(0);
    expect(chunks[1].chunkIndex).toBe(1);
  });

  it("retrieves the most relevant chunk for a query and tags with [S1]", () => {
    const textA =
      "RC Low-Pass filters attenuate high frequency signals while allowing low frequency signals to pass unaffected. Cutoff frequency fc is 1 / (2piRC).";
    const textB =
      "Joule heating describes how electric power dissipates as thermal heat in resistors, calculated as P = I^2 * R.";
    const textC =
      "Kinematic projectiles travel in a parabolic trajectory under constant acceleration of gravity g = 9.8 m/s^2.";

    const chunks = [
      ...chunkText("sA", "RC Filters", textA),
      ...chunkText("sB", "Ohm's Law", textB),
      ...chunkText("sC", "Kinematics", textC),
    ];

    const results = retrieveRelevantChunks("What is the formula for cutoff frequency in RC filters?", chunks, 2);

    expect(results.length).toBe(2);
    expect(results[0].citationTag).toBe("[S1]");
    expect(results[0].chunk.sourceId).toBe("sA");
    expect(results[0].chunk.text).toContain("Cutoff frequency");
  });

  it("handles empty query or empty chunks gracefully", () => {
    expect(retrieveRelevantChunks("test", [])).toEqual([]);

    const chunks = chunkText("s1", "Doc", "Simple test text content.");
    const results = retrieveRelevantChunks("", chunks);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].citationTag).toBe("[S1]");
  });

  it("preserves page numbers and generates page citation tags [S1 p.12]", () => {
    const pages = [
      { pageNumber: 12, text: "Thermodynamics first law states delta U = Q - W where energy is conserved." },
      { pageNumber: 15, text: "Entropy in isolated systems never decreases according to the second law." },
    ];
    const chunks = chunkPages("src-thermo", "Thermodynamics", pages);
    expect(chunks[0].page).toBe(12);

    const results = retrieveRelevantChunks("What is the first law delta U?", chunks, 1);
    expect(results[0].citationTag).toBe("[S1 p.12]");
    expect(results[0].page).toBe(12);
  });
});
