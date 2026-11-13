import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pieces: new Map<number, unknown>(),
  quests: new Map<number, unknown>(),
  writes: [] as Array<{ kind: string; data: unknown }>,
  kc: {} as Record<string, unknown>,
}));
vi.mock("@/lib/firebase/admin", () => {
  const ref: Record<string, unknown> = {
    get: async () => ({ exists: true, data: () => h.kc }),
    set: async (data: unknown) => h.writes.push({ kind: "set", data }),
    update: async (data: unknown) => h.writes.push({ kind: "update", data }),
    collection: () => ref,
    doc: () => ref,
  };
  return { adminDb: () => ref, Timestamp: { now: () => "now" } };
});
vi.mock("@/lib/lesson/audio", () => ({ getAudioLesson: async () => null }));
vi.mock("@/lib/sim/store", () => ({ getStoredSimulation: async () => null, simulationRef: () => ({ get: async () => ({ data: () => undefined }) }) }));
vi.mock("@/lib/sim/pieces", () => ({ getStoredPieces: async () => h.pieces }));
vi.mock("@/lib/quest/store", () => ({ getStoredQuests: async () => h.quests, questStatus: (q: { status: string }) => q.status }));
vi.mock("@/lib/practice/bank", () => ({ readQuizBank: async () => [], readFlashcardBank: async () => [], stableId: (s: string) => s }));

import { lessonForStudents, liveMode, liveStatus, pushToStudents } from "./live";
import { publishMapOf } from "./published";

describe("push to students", () => {
  it("older topics follow the working copy; new ones start offline", () => {
    expect(liveMode({}, "lesson")).toBe("follow");
    expect(liveMode({ contentPublished: { lesson: false } }, "lesson")).toBe("off");
    expect(liveMode({ contentPublished: { lesson: true } }, "lesson")).toBe("follow");
    expect(liveMode({ contentPublished: { lesson: { fp: "x" } } }, "lesson")).toBe("snapshot");
  });

  it("students read the pushed snapshot, not the teacher's newer edits", () => {
    const kc = { lessonMarkdown: "v2 draft edits", liveLessonMarkdown: "v1 pushed", contentPublished: { lesson: { fp: "a" } } };
    expect(lessonForStudents(kc)).toBe("v1 pushed");
    expect(lessonForStudents({ ...kc, contentPublished: { lesson: false } })).toBe("");
    // a pushed snapshot is all students get: an empty one never falls back to the teacher's unfinished working copy
    expect(lessonForStudents({ lessonMarkdown: "draft the teacher is still editing", liveLessonMarkdown: "", contentPublished: { lesson: { fp: "a" } } })).toBe("");
    expect(lessonForStudents({ lessonMarkdown: "old topic" })).toBe("old topic");
  });

  it("counts a snapshot as published", () => {
    expect(publishMapOf({ contentPublished: { lesson: { fp: "a" }, audio: false } })).toMatchObject({ lesson: true, audio: false });
  });

  it("a topic with only piece labs or quests can still be published (otherwise students see 'Not published yet')", async () => {
    h.pieces = new Map([[0, { index: 0, status: "ready", html: "<html></html>", version: 1 }]]);
    h.quests = new Map();
    const kc = { contentPublished: { lesson: false, audio: false, simulation: false, practice: false } };
    const sim = (await liveStatus("c", "k", kc)).find((s) => s.key === "simulation")!;
    expect(sim.hasDraft).toBe(true);
    expect(sim.mode).toBe("off");

    h.pieces = new Map();
    h.quests = new Map([[1, { index: 1, status: "ready", challenges: [{}], version: 1 }]]);
    expect((await liveStatus("c", "k", kc)).find((s) => s.key === "simulation")!.hasDraft).toBe(true);

    h.quests = new Map([[1, { index: 1, status: "generating", challenges: [], version: 1 }]]);
    expect((await liveStatus("c", "k", kc)).find((s) => s.key === "simulation")!.hasDraft).toBe(false);
  });

  it("pushing the simulation key with no main simulation stores null, never undefined (Firestore rejects undefined)", async () => {
    h.pieces = new Map([[0, { index: 0, status: "ready", html: "<html></html>", version: 1 }]]);
    h.kc = { contentPublished: { lesson: false, audio: false, simulation: false, practice: false } };
    h.writes.length = 0;
    await pushToStudents("c", "k", ["simulation"]);
    const live = h.writes.find((w) => w.kind === "set")!.data as { sim: unknown };
    expect(live.sim).toBeNull();
    const upd = h.writes.find((w) => w.kind === "update")!.data as { contentPublished: Record<string, unknown> };
    expect(typeof upd.contentPublished.simulation).toBe("object");
  });
});
