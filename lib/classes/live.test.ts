import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({}), Timestamp: { now: () => ({}) } }));
vi.mock("@/lib/lesson/audio", () => ({ getAudioLesson: async () => null }));
vi.mock("@/lib/sim/store", () => ({ getStoredSimulation: async () => null, simulationRef: () => ({}) }));
vi.mock("@/lib/practice/bank", () => ({ readQuizBank: async () => [], readFlashcardBank: async () => [], stableId: (s: string) => s }));

import { lessonForStudents, liveMode } from "./live";
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
    expect(lessonForStudents({ lessonMarkdown: "old topic" })).toBe("old topic");
  });

  it("counts a snapshot as published", () => {
    expect(publishMapOf({ contentPublished: { lesson: { fp: "a" }, audio: false } })).toMatchObject({ lesson: true, audio: false });
  });
});
