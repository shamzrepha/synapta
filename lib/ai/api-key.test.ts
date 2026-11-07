import { describe, it, expect, vi, beforeEach } from "vitest";

const store: { doc: Record<string, unknown> | null } = { doc: null };
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ data: () => store.doc ?? undefined }),
        set: async (v: Record<string, unknown>) => {
          store.doc = v;
        },
        delete: async () => {
          store.doc = null;
        },
      }),
    }),
  }),
  Timestamp: { now: () => ({ toDate: () => new Date("2026-11-02T10:00:00Z") }) },
}));

import { activeGeminiKey, cleanApiKey, clearGeminiKey, geminiKeyInfo, looksLikeGeminiKey, refreshGeminiKey, saveGeminiKey } from "./api-key";

const KEY = "AIza" + "B".repeat(35);

describe("Gemini key from the admin console", () => {
  beforeEach(() => {
    store.doc = null;
    process.env.GEMINI_API_KEY = "AIza" + "E".repeat(31) + "ENV1";
  });

  it("cleans and accepts AI Studio and Google API key shapes", () => {
    expect(looksLikeGeminiKey(KEY)).toBe(true);
    expect(looksLikeGeminiKey(` "${KEY}" `)).toBe(true);
    expect(looksLikeGeminiKey(`'${KEY}'`)).toBe(true);
    expect(looksLikeGeminiKey("AIza" + "x".repeat(30))).toBe(true);
    expect(cleanApiKey(` "${KEY}" `)).toBe(KEY);
    expect(looksLikeGeminiKey("sk-123")).toBe(false);
    expect(looksLikeGeminiKey("AIza" + "x".repeat(5))).toBe(false);
  });

  it("uses the admin's key once saved, and the environment key after it is removed", async () => {
    await clearGeminiKey();
    expect(activeGeminiKey()).toBe(process.env.GEMINI_API_KEY);
    await saveGeminiKey(KEY, { uid: "a1", email: "admin@x.com" });
    expect(activeGeminiKey()).toBe(KEY);
    const info = await geminiKeyInfo();
    expect(info).toMatchObject({ source: "admin", last4: "BBBB", updatedBy: "admin@x.com" });
    expect(JSON.stringify(info)).not.toContain(KEY);
    await clearGeminiKey();
    expect(activeGeminiKey()).toBe(process.env.GEMINI_API_KEY);
    expect((await geminiKeyInfo()).source).toBe("environment");
  });

  it("picks up a key another server instance saved", async () => {
    await clearGeminiKey();
    store.doc = { key: KEY, last4: "BBBB" };
    await refreshGeminiKey(true);
    expect(activeGeminiKey()).toBe(KEY);
  });
});
