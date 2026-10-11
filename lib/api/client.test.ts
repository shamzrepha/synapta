import { describe, it, expect, vi } from "vitest";
import { asArray, fetchJson } from "./client";

describe("lib/api/client", () => {
  describe("asArray", () => {
    it("handles null and undefined", () => {
      expect(asArray(null)).toEqual([]);
      expect(asArray(undefined)).toEqual([]);
    });

    it("handles non-array objects and primitives", () => {
      expect(asArray({})).toEqual([]);
      expect(asArray({ classes: [] })).toEqual([]);
      expect(asArray("string")).toEqual([]);
      expect(asArray(123)).toEqual([]);
      expect(asArray(true)).toEqual([]);
    });

    it("returns arrays unmodified", () => {
      expect(asArray([])).toEqual([]);
      expect(asArray([1, 2, 3])).toEqual([1, 2, 3]);
      expect(asArray(["a", "b"])).toEqual(["a", "b"]);
    });
  });

  describe("fetchJson", () => {
    it("returns formatted ApiResult when response is ok", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: async () => ({ ok: true, data: [1, 2, 3] }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const res = await fetchJson<number[]>("/api/test");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toEqual([1, 2, 3]);
      }
    });

    it("returns MALFORMED_RESPONSE when JSON does not conform to ApiResult", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: async () => ({ randomField: "data" }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const res = await fetchJson<number[]>("/api/test");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("MALFORMED_RESPONSE");
      }
    });

    it("returns NETWORK error on fetch exception", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network failed"));
      global.fetch = mockFetch as unknown as typeof fetch;

      const res = await fetchJson<number[]>("/api/test");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("NETWORK");
      }
    });
  });
});
