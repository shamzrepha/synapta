import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, Record<string, unknown> | null> = {
  groq: null,
  ai_provider: null,
};

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: (col: string) => ({
      doc: (id: string) => ({
        get: async () => ({ data: () => store[id] ?? undefined }),
        set: async (v: Record<string, unknown>) => {
          store[id] = v;
        },
        delete: async () => {
          store[id] = null;
        },
      }),
    }),
  }),
  Timestamp: { now: () => ({ toDate: () => new Date("2026-11-07T10:00:00Z") }) },
}));

import {
  looksLikeGroqKey,
  activeGroqKey,
  saveGroqKey,
  clearGroqKey,
  groqKeyInfo,
  getActiveAiProvider,
  setAiProvider,
  aiProviderInfo,
  mapToGroqModel,
} from "./groq";

const GROQ_KEY = "gsk_" + "x".repeat(48) + "1234";

describe("Groq AI Engine and Provider Switcher", () => {
  beforeEach(() => {
    store.groq = null;
    store.ai_provider = null;
    delete process.env.GROQ_API_KEY;
  });

  describe("looksLikeGroqKey", () => {
    it("validates genuine Groq API key patterns", () => {
      expect(looksLikeGroqKey(GROQ_KEY)).toBe(true);
      expect(looksLikeGroqKey(` "${GROQ_KEY}" `)).toBe(true);
      expect(looksLikeGroqKey(`'${GROQ_KEY}'`)).toBe(true);
    });

    it("rejects non-Groq keys or malformed keys", () => {
      expect(looksLikeGroqKey("AIzaSyB123456789012345678901234567890")).toBe(false); // Gemini
      expect(looksLikeGroqKey("sk-proj-12345")).toBe(false); // OpenAI
      expect(looksLikeGroqKey("gsk_short")).toBe(false); // Too short
      expect(looksLikeGroqKey("   ")).toBe(false);
    });
  });

  describe("Groq key storage & masking", () => {
    it("stores Groq key and never exposes the secret", async () => {
      await clearGroqKey();
      expect(activeGroqKey()).toBe("");

      await saveGroqKey(GROQ_KEY, { uid: "admin1", email: "admin@sunroot.test" });
      expect(activeGroqKey()).toBe(GROQ_KEY);

      const info = await groqKeyInfo();
      expect(info.source).toBe("admin");
      expect(info.last4).toBe("1234");
      expect(info.updatedBy).toBe("admin@sunroot.test");
      expect(JSON.stringify(info)).not.toContain(GROQ_KEY);

      await clearGroqKey();
      expect(activeGroqKey()).toBe("");
      const emptyInfo = await groqKeyInfo();
      expect(emptyInfo.source).toBe("none");
    });

    it("falls back to environment GROQ_API_KEY if no admin key is set", async () => {
      await clearGroqKey();
      process.env.GROQ_API_KEY = "gsk_" + "e".repeat(40) + "ENV9";
      expect(activeGroqKey()).toBe(process.env.GROQ_API_KEY);
      const info = await groqKeyInfo();
      expect(info.source).toBe("environment");
      expect(info.last4).toBe("ENV9");
    });
  });

  describe("Active AI Provider Switching", () => {
    it("defaults to gemini provider", async () => {
      const provider = await getActiveAiProvider();
      expect(provider).toBe("gemini");
    });

    it("switches to groq and back to gemini with a flick", async () => {
      await setAiProvider("groq", { uid: "admin1", email: "admin@sunroot.test" });
      expect(await getActiveAiProvider()).toBe("groq");

      const info = await aiProviderInfo();
      expect(info.provider).toBe("groq");
      expect(info.updatedBy).toBe("admin@sunroot.test");

      await setAiProvider("gemini", { uid: "admin1", email: "admin@sunroot.test" });
      expect(await getActiveAiProvider()).toBe("gemini");
    });
  });

  describe("mapToGroqModel", () => {
    it("maps heavy tasks to llama-3.3-70b-versatile", () => {
      expect(mapToGroqModel(undefined, true)).toBe("llama-3.3-70b-versatile");
    });

    it("maps light tasks to llama-3.1-8b-instant", () => {
      expect(mapToGroqModel(undefined, false)).toBe("llama-3.1-8b-instant");
    });

    it("preserves explicit llama / mixtral model requests", () => {
      expect(mapToGroqModel("llama-3.3-70b-specdec")).toBe("llama-3.3-70b-specdec");
      expect(mapToGroqModel("mixtral-8x7b-32768")).toBe("mixtral-8x7b-32768");
    });
  });
});
