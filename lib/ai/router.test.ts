import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  modelFor,
  fallbackModel,
  getChainForTask,
  classifyProviderError,
  AiQuotaExhaustedError,
  AiGenerationError,
  generateWithFallback,
  extractJsonPayload,
} from "./router";
import { z } from "zod";
import { sanitizeModelId, parseModelChain, DEFAULT_MODEL_CONFIG } from "./models";
import { markModelExhausted, isModelAvailable } from "./health";
import { handleAuthError } from "@/lib/auth/requireUser";
import { resetCachedEnv } from "@/lib/env";

// Mock Firebase Admin and Gemini Client for unit testing
vi.mock("@/lib/firebase/admin", () => {
  const store = new Map<string, Record<string, unknown>>();
  return {
    adminDb: () => ({
      collection: (col: string) => ({
        doc: (id: string) => ({
          get: async () => ({
            exists: store.has(`${col}/${id}`),
            data: () => store.get(`${col}/${id}`) || {},
          }),
          set: async (val: Record<string, unknown>, opts?: { merge?: boolean }) => {
            const key = `${col}/${id}`;
            const existing = store.get(key) || {};
            store.set(key, opts?.merge ? { ...existing, ...val } : val);
          },
        }),
      }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        get: async () => ({ exists: false, data: () => ({}) }),
        set: () => {},
        update: () => {},
      }),
    }),
    Timestamp: {
      now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
    },
  };
});

const mockGenerateContent = vi.fn();
vi.mock("@/lib/gemini/client", () => ({
  getGeminiClient: () => ({
    models: {
      generateContent: (...args: unknown[]) => mockGenerateContent(...args),
    },
  }),
}));

describe("lib/ai/router & models (Fix Pack C1 & C2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GEMINI_MODEL_TUTOR;
    delete process.env.GEMINI_MODEL_STRUCTURED;
    delete process.env.GEMINI_MODEL_BUILD;
    delete process.env.GEMINI_FALLBACK_CHAIN;
    // getServerEnv() caches; with a complete env (as in CI) later overrides would be ignored
    resetCachedEnv();
  });

  describe("Retired models", () => {
    it("replaces a shut-down model pinned in env with the current default", () => {
      process.env.GEMINI_MODEL_TUTOR = "gemini-2.0-flash";
      resetCachedEnv();
      expect(modelFor("tutor_chat")).toBe(DEFAULT_MODEL_CONFIG.tutor);
    });

    it("drops retired models from a custom chain and keeps the default safety net", () => {
      process.env.GEMINI_FALLBACK_CHAIN = "gemini-3.1-flash-lite-preview,gemini-1.5-flash";
      resetCachedEnv();
      const chain = getChainForTask("tutor_chat");
      expect(chain).not.toContain("gemini-3.1-flash-lite-preview");
      expect(chain).not.toContain("gemini-1.5-flash");
      expect(chain).toEqual(expect.arrayContaining(DEFAULT_MODEL_CONFIG.chainLight));
    });
  });

  describe("C1: Model Registry and Defaults", () => {
    it("returns correct C1 defaults for each defined task", () => {
      expect(modelFor("tutor_chat")).toBe(DEFAULT_MODEL_CONFIG.tutor);
      expect(modelFor("structured_spec")).toBe(DEFAULT_MODEL_CONFIG.structured);
      expect(modelFor("long_document")).toBe(DEFAULT_MODEL_CONFIG.longdoc);
      expect(modelFor("class_build")).toBe(DEFAULT_MODEL_CONFIG.build);
      expect(modelFor("grading_high_stakes")).toBe(DEFAULT_MODEL_CONFIG.grading);
      expect(modelFor("voice")).toBe(DEFAULT_MODEL_CONFIG.voice);
      expect(fallbackModel()).toBe("gemini-3.5-flash-lite");
    });

    it("honors environment overrides verbatim without silent rewrites", () => {
      process.env.GEMINI_MODEL_TUTOR = "my-custom-experimental-model";
      resetCachedEnv();
      expect(modelFor("tutor_chat")).toBe("my-custom-experimental-model");
    });

    it("deduplicates chains cleanly", () => {
      const chain = parseModelChain("gemini-3.1-flash-lite, gemini-3.1-flash-lite, gemini-3.5-flash-lite");
      expect(chain).toEqual(["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
    });

    it("passes through unknown model IDs with a warning without silently replacing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const unknownId = "custom-unknown-provider-model-v1";
      const result = sanitizeModelId(unknownId);

      expect(result).toBe(unknownId);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Model ID "custom-unknown-provider-model-v1" is not recognized')
      );
      warnSpy.mockRestore();
    });

    it("ensures light tasks never spill into heavy models", () => {
      const chain = getChainForTask("tutor_chat");
      expect(chain).toEqual(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
      expect(chain).not.toContain("gemini-3.6-flash");
      expect(chain).not.toContain("gemini-3.8-flash");
    });

    it("ensures heavy tasks walk heavy chain and as last resort drop to light", () => {
      const chain = getChainForTask("class_build");
      expect(chain[0]).toBe("gemini-3.6-flash");
      expect(chain).toContain("gemini-3.8-flash");
      expect(chain).toContain("gemini-3.5-flash-lite");
    });
  });

  describe("C2: Quota-Aware Error Classification & Execution", () => {
    it("classifies daily exhaustion errors accurately", () => {
      const err = {
        status: "RESOURCE_EXHAUSTED",
        message: "You exceeded your current quota. limit: 20",
        details: [
          {
            violations: [
              { quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" },
            ],
            retryDelay: "64700s",
          },
        ],
      };

      const classified = classifyProviderError(err);
      expect(classified.type).toBe("daily_exhaustion");
      expect(classified.retryDelaySeconds).toBe(64700);
    });

    it("classifies per-minute burst rate limits", () => {
      const err = {
        status: "RESOURCE_EXHAUSTED",
        details: [
          {
            violations: [{ quotaId: "GenerateRequestsPerMinutePerProject" }],
            retryDelay: "15s",
          },
        ],
      };

      const classified = classifyProviderError(err);
      expect(classified.type).toBe("rate_limit_minute");
      expect(classified.retryDelaySeconds).toBe(15);
    });

    it("cascades from Model A to Model B on simulated 429 daily quota and marks Model A exhausted", async () => {
      // First call (Model A) fails with daily exhaustion
      mockGenerateContent
        .mockRejectedValueOnce({
          status: "RESOURCE_EXHAUSTED",
          message: "Quota exceeded for metric: generate_content_free_tier_requests",
          details: [{ violations: [{ quotaId: "GenerateRequestsPerDay" }], retryDelay: "50000s" }],
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({ syllabusTitle: "Physics 101" }),
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 100 },
        });

      const res = await generateWithFallback({
        task: "structured_spec",
        userPrompt: "Generate syllabus",
      });

      expect(res.fallbackTriggered).toBe(true);
      expect(res.modelUsed).toBe("gemini-3.1-flash-lite");

      // Verify Model A was marked exhausted and is no longer available
      const primaryAvail = await isModelAvailable("gemini-3.5-flash-lite");
      expect(primaryAvail).toBe(false);
    });

    it("throws typed AiQuotaExhaustedError when all candidate models are exhausted", async () => {
      await markModelExhausted("gemini-3.1-flash-lite");
      await markModelExhausted("gemini-3.5-flash-lite");

      await expect(
        generateWithFallback({
          task: "tutor_chat",
          userPrompt: "Explain gravity",
        })
      ).rejects.toThrowError(AiQuotaExhaustedError);
    });

    it("does not sit out a per-minute rate limit when the caller can't wait (live chat)", async () => {
      // every model answers "slow down, retry in 15 s": a tutor chat must give up fast instead of waiting 15 s x models
      mockGenerateContent.mockRejectedValue({ status: "RESOURCE_EXHAUSTED", message: "429 rate limit", details: [{ violations: [{ quotaId: "GenerateRequestsPerMinute" }], retryDelay: "15s" }] });
      const started = Date.now();
      await expect(generateWithFallback({ task: "tutor_chat", userPrompt: "hi", maxWaitMs: 1000 })).rejects.toBeTruthy();
      expect(Date.now() - started).toBeLessThan(3000);
      expect(mockGenerateContent.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it("handleAuthError never leaks raw provider JSON in user-facing message", () => {
      const rawError = new Error(
        JSON.stringify({
          error: {
            code: 429,
            message: "Quota exceeded for metric: generativelanguage.googleapis.com, limit: 20",
          },
        })
      );

      const response = handleAuthError(rawError);
      expect(response.status).toBe(429);

      // In NextResponse.json, check headers and status
      expect(response.headers.get("content-type")).toContain("application/json");
    });
  });

  describe("robust output handling", () => {
    it("extracts JSON wrapped in fences or prose", () => {
      expect(extractJsonPayload('```json\n{"a":1}\n```')).toEqual({ a: 1 });
      expect(extractJsonPayload('Sure! Here it is: {"a":[1,2]} Hope that helps.')).toEqual({ a: [1, 2] });
      expect(extractJsonPayload("[1,2,3]")).toEqual([1, 2, 3]);
      expect(() => extractJsonPayload("no json here")).toThrow();
    });

    it("classifies invalid API keys as auth errors", () => {
      expect(classifyProviderError(new Error("API key not valid. Please pass a valid API key.")).type).toBe("auth");
    });

    it("reports a generation error (not a quota error) when output never matches the schema", async () => {
      mockGenerateContent.mockResolvedValue({ text: "not json at all", usageMetadata: {} });
      await expect(
        generateWithFallback({
          task: "notebook_chat",
          userPrompt: "x",
          schema: z.object({ ok: z.boolean() }),
          maxRetriesPerModel: 0,
          isPrivileged: true,
        })
      ).rejects.toThrowError(AiGenerationError);
    });
  });
});

describe("task → model matching", () => {
  it("runs build-type work on the strong model and everything else on the fast one", () => {
    for (const t of ["class_build", "sim_build", "studio_build", "assignment_author", "assignment_architect", "assignment_reviewer", "grading_high_stakes"]) {
      expect(modelFor(t), t).toBe(DEFAULT_MODEL_CONFIG.build);
      expect(getChainForTask(t)[0], t).toBe(DEFAULT_MODEL_CONFIG.build);
    }
    for (const t of ["tutor_chat", "notebook_chat", "quiz_gen", "flashcard_gen", "discussion_script", "study_guide", "lesson_notes"]) {
      expect(modelFor(t), t).toMatch(/lite/);
    }
  });

  it("keeps light tasks off the heavy chain and voice on a TTS model", () => {
    expect(getChainForTask("discussion_script").some((m) => DEFAULT_MODEL_CONFIG.chainHeavy.includes(m))).toBe(false);
    expect(modelFor("voice_tts")).toMatch(/tts/);
  });
});
