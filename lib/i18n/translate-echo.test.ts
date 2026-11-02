import { describe, it, expect, vi, beforeEach } from "vitest";

// a tiny in-memory Firestore: translation memory docs keyed by id
const store = new Map<string, Record<string, unknown>>();
const ref = (id: string) => ({ id });
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: () => ({ doc: (id: string) => ref(id) }),
    getAll: async (...refs: Array<{ id: string }>) => refs.map((r) => ({ exists: store.has(r.id), data: () => store.get(r.id) })),
    batch: () => {
      const ops: Array<[string, Record<string, unknown>]> = [];
      return { set: (r: { id: string }, v: Record<string, unknown>) => ops.push([r.id, v]), commit: async () => ops.forEach(([id, v]) => store.set(id, v)) };
    },
  }),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
const generate = vi.fn();
vi.mock("@/lib/ai/router", () => ({ generateWithFallback: (...a: unknown[]) => generate(...a) }));

import { isUntranslatedEcho, textKey, translateOne, translateTexts } from "./translate";
import { looksEnglish, needsTranslation } from "./languages";

const EN = "Current is the flow of electric charge through a wire.";
const YO = "Ìṣàn iná ni ìṣàn agbára iná mànàmáná nínú wáyà.";

describe("English detection", () => {
  it("tells English prose from Pidgin and other languages", () => {
    expect(looksEnglish(EN)).toBe(true);
    expect(looksEnglish("Wetin be current? Na di way wey charge dey waka for wire.")).toBe(false);
    expect(looksEnglish(YO)).toBe(false);
    expect(looksEnglish("Le courant est le flux de charge dans un fil électrique.")).toBe(false);
    expect(looksEnglish("Ohm's law")).toBe(false); // too short to judge
  });

  it("only asks for translation when the text is not already in the target language", () => {
    expect(needsTranslation(EN, "pcm")).toBe(true);
    expect(needsTranslation(YO, "yo")).toBe(false);
    expect(needsTranslation("Wetin be current? Na di way wey charge dey waka.", "pcm")).toBe(false);
    expect(needsTranslation(EN, "en")).toBe(false);
  });

  it("counts an unchanged English sentence as a skipped translation, but not text already in the language", () => {
    expect(isUntranslatedEcho("yo", EN, EN)).toBe(true);
    expect(isUntranslatedEcho("yo", YO, YO)).toBe(false);
    expect(isUntranslatedEcho("pcm", "Thank you, Ada", "Thank you, Ada")).toBe(false);
    expect(isUntranslatedEcho("en", EN, EN)).toBe(false);
  });
});

describe("translation memory with echoes", () => {
  beforeEach(() => {
    store.clear();
    generate.mockReset();
  });

  it("retries an echoed sentence once, strictly, and remembers the real translation", async () => {
    generate.mockResolvedValueOnce({ data: { translations: [EN] } }).mockResolvedValueOnce({ data: { translations: [YO] } });
    const out = await translateTexts("yo", [EN]);
    expect(out.get(EN)).toBe(YO);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(String(generate.mock.calls[1][0].systemInstruction)).toMatch(/MUST come back/);
    expect(store.get(textKey("yo", EN))?.t).toBe(YO);
  });

  it("does not resend a stubborn sentence on every request, and translateOne reports it as untranslated", async () => {
    generate.mockResolvedValue({ data: { translations: [EN] } });
    expect(await translateOne("yo", EN)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(store.get(textKey("yo", EN))?.echo).toBe(true);
    // a second request inside the retry window is answered from memory without the model
    expect(await translateOne("yo", EN)).toBeNull();
    expect((await translateTexts("yo", [EN])).get(EN)).toBe(EN);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("tries again once the echo marker is old", async () => {
    store.set(textKey("yo", EN), { t: EN, echo: true, at: { toMillis: () => Date.now() - 2 * 60 * 60_000 } });
    generate.mockResolvedValueOnce({ data: { translations: [YO] } });
    expect(await translateOne("yo", EN)).toBe(YO);
  });

  it("accepts text that is already in the target language without a retry", async () => {
    generate.mockResolvedValueOnce({ data: { translations: [YO] } });
    expect(await translateOne("yo", YO)).toBe(YO);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(store.get(textKey("yo", YO))?.echo).toBeUndefined();
  });

  it("re-translates an old memory entry that holds an untranslated sentence", async () => {
    store.set(textKey("ha", EN), { t: EN });
    generate.mockResolvedValueOnce({ data: { translations: ["Wutar lantarki tana gudana ta cikin waya."] } });
    expect(await translateOne("ha", EN)).toBe("Wutar lantarki tana gudana ta cikin waya.");
  });
});
