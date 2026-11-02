import { describe, it, expect, vi, beforeEach } from "vitest";

// in-memory Firestore: every doc of the audio collection keyed by id
const docs = new Map<string, Record<string, unknown>>();
const ts = () => {
  const at = Date.now();
  return { toMillis: () => at };
};
const ref = (id: string) => ({
  id,
  get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
  set: async (v: Record<string, unknown>, o?: { merge?: boolean }) => void docs.set(id, o?.merge ? { ...(docs.get(id) || {}), ...v } : { ...v }),
  update: async (v: Record<string, unknown>) => void docs.set(id, { ...(docs.get(id) || {}), ...v }),
});
const col = { doc: (id: string) => ref(id) };
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ collection: () => col }) }) }) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: (r: { get: () => unknown }) => r.get(), set: (r: { set: (v: unknown, o: unknown) => void }, v: unknown, o: unknown) => r.set(v, o) }),
  }),
  Timestamp: { now: () => ts() },
}));
vi.mock("@/lib/ai/router", () => ({ generateWithFallback: vi.fn(), AiGenerationError: class extends Error {} }));
vi.mock("@/lib/quota/guard", () => ({ checkRateLimitAndQuota: vi.fn() }));
vi.mock("@/lib/kc/context", () => ({ loadKcGroundingContext: vi.fn() }));
const speak = vi.fn();
vi.mock("@/lib/ai/voice", () => ({ edgeAvailable: () => false, resetVoiceBreakers: () => undefined, synthesizeSpeech: (...a: unknown[]) => speak(...a) }));

import { MAX_LINE_FAILS, languageFailures, prepareLanguage, readClip, type AudioLessonMeta } from "./audio";

const meta = {
  status: "ready",
  title: "Ohm's law",
  teacherName: "Ada",
  studentName: "Tobi",
  voiceStyle: "female",
  version: 3,
  turns: [
    { speaker: "teacher", text: "Voltage is the push.", hasAudio: true },
    { speaker: "student", text: "And current is the flow?", hasAudio: true },
    { speaker: "teacher", text: "Exactly, charge moving.", hasAudio: true },
  ],
} as unknown as AudioLessonMeta;
const fr = (t: string) => `FR ${t}`;
const translate = async (texts: string[]) => new Map(texts.map((t) => [t, fr(t)]));

describe("preparing a podcast in another language", () => {
  beforeEach(() => {
    docs.clear();
    speak.mockReset();
    speak.mockImplementation(async (text: string) => ({ audio: Buffer.from(`mp3:${text}`), mimeType: "audio/mpeg", engine: "edge" }));
  });

  it("records every line once in the language, starting from the line the listener is waiting for", async () => {
    await prepareLanguage("c", "k", meta, "fr", translate, 1);
    expect(speak.mock.calls.map((c) => c[0])[0]).toBe(fr("And current is the flow?"));
    expect(speak).toHaveBeenCalledTimes(3);
    const clip = await readClip("c", "k", 3, 0, "fr", fr("Voltage is the push."));
    expect(clip?.audio.toString()).toBe(`mp3:${fr("Voltage is the push.")}`);
    expect(docs.get("job_3_fr")?.running).toBe(false);
  });

  it("doesn't record lines that are already saved", async () => {
    await prepareLanguage("c", "k", meta, "fr", translate);
    speak.mockClear();
    await prepareLanguage("c", "k", meta, "fr", translate);
    expect(speak).not.toHaveBeenCalled();
  });

  it("runs once at a time per language", async () => {
    docs.set("job_3_fr", { running: true, beatAt: ts() });
    await prepareLanguage("c", "k", meta, "fr", translate);
    expect(speak).not.toHaveBeenCalled();
  });

  it("counts failures per line so a line that keeps failing stops holding up the podcast", async () => {
    speak.mockResolvedValue(null);
    for (let n = 0; n < MAX_LINE_FAILS + 1; n++) await prepareLanguage("c", "k", meta, "fr", translate);
    const failed = await languageFailures("c", "k", 3, "fr");
    expect(failed[0]).toBe(MAX_LINE_FAILS);
    // once a line reached the limit it isn't tried again
    expect(speak.mock.calls.length).toBe(3 * MAX_LINE_FAILS);
  });

  it("forgets failures after a while, so a line is tried again once the AI allowance resets", async () => {
    docs.set("job_3_fr", { running: false, beatAt: ts(), failed: { 0: MAX_LINE_FAILS }, failedAt: { 0: Date.now() - 11 * 60_000 } });
    expect(await languageFailures("c", "k", 3, "fr")).toEqual({});
    await prepareLanguage("c", "k", meta, "fr", translate);
    expect(speak).toHaveBeenCalledTimes(3);
  });
});
