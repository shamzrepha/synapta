import { describe, it, expect } from "vitest";
import { isChunkError, shouldRecover } from "./chunk-error";

describe("chunk error recovery", () => {
  it("recognises the ways a missing app file shows up", () => {
    expect(isChunkError(new Error("Failed to load chunk /_next/static/immutable/chunks/3tqc9u5-q01tg.js from module 964893"))).toBe(true);
    expect(isChunkError(Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" }))).toBe(true);
    expect(isChunkError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkError(new Error("error loading dynamically imported module: https://x/y.js"))).toBe(true);
    expect(isChunkError("Failed to fetch dynamically imported module")).toBe(true);
  });
  it("leaves real bugs alone", () => {
    expect(isChunkError(new Error("Cannot read properties of undefined (reading 'every')"))).toBe(false);
    expect(isChunkError(null)).toBe(false);
    expect(isChunkError(undefined)).toBe(false);
  });
  it("tries once, then waits so it can never loop", () => {
    expect(shouldRecover(null, 1_000_000)).toBe(true);
    expect(shouldRecover(1_000_000, 1_000_000 + 30_000)).toBe(false);
    expect(shouldRecover(1_000_000, 1_000_000 + 121_000)).toBe(true);
    expect(shouldRecover(Number.NaN, 5)).toBe(true);
  });
});
