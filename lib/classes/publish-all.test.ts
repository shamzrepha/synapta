import { describe, expect, it, vi, beforeEach } from "vitest";

const liveStatus = vi.fn();
const pushToStudents = vi.fn();
const takeOffline = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({ Timestamp: { now: () => "now" } }));
vi.mock("@/lib/studio/labs", () => ({ snapshotLabDesign: vi.fn(async () => ({})) }));
vi.mock("@/lib/classes/live", () => ({
  liveStatus: (...a: unknown[]) => liveStatus(...a),
  pushToStudents: (...a: unknown[]) => pushToStudents(...a),
  takeOffline: (...a: unknown[]) => takeOffline(...a),
}));

import { pushClassContent } from "./publish-all";

const caller = { uid: "t", email: null, role: "teacher" } as never;
const kc = (id: string, title: string) => ({ id, data: () => ({ title }), ref: { update: vi.fn(async () => undefined) } });
const st = (key: string, hasDraft: boolean, mode: string, changed = false) => ({ key, hasDraft, mode, changed, pushedAt: null });

describe("pushClassContent", () => {
  beforeEach(() => {
    liveStatus.mockReset();
    pushToStudents.mockReset();
    takeOffline.mockReset();
  });

  it("pushes every piece that exists but is not live yet", async () => {
    liveStatus.mockResolvedValue([st("lesson", true, "off"), st("audio", false, "off"), st("simulation", false, "off"), st("practice", true, "off")]);
    const r = await pushClassContent(caller, "c", [kc("k1", "Motors")] as never, true);
    expect(pushToStudents).toHaveBeenCalledTimes(2);
    expect(pushToStudents).toHaveBeenCalledWith("c", "k1", ["lesson"]);
    expect(pushToStudents).toHaveBeenCalledWith("c", "k1", ["practice"]);
    expect(r.pushed).toBe(2);
    expect(r.emptyTopics).toEqual([]);
  });

  it("one failing piece does not stop the others", async () => {
    liveStatus.mockResolvedValue([st("lesson", true, "off"), st("audio", true, "off"), st("simulation", false, "off"), st("practice", false, "off")]);
    pushToStudents.mockImplementation(async (_c: string, _k: string, keys: string[]) => {
      if (keys[0] === "audio") throw new Error("Some lines aren't recorded");
    });
    const r = await pushClassContent(caller, "c", [kc("k1", "Motors")] as never, true);
    expect(r.pushed).toBe(1);
    expect(r.skipped[0]).toContain("podcast");
  });

  it("reports topics that have no lecture note so students are not shown an empty topic", async () => {
    liveStatus.mockResolvedValue([st("lesson", false, "off"), st("audio", false, "off"), st("simulation", false, "off"), st("practice", false, "off")]);
    const r = await pushClassContent(caller, "c", [kc("k1", "Motors")] as never, true);
    expect(r.pushed).toBe(0);
    expect(r.emptyTopics).toEqual(["Motors"]);
  });

  it("leaves older (follow) and unchanged snapshot content alone", async () => {
    liveStatus.mockResolvedValue([st("lesson", true, "follow"), st("audio", true, "snapshot", false), st("simulation", true, "snapshot", true), st("practice", false, "off")]);
    const r = await pushClassContent(caller, "c", [kc("k1", "Motors")] as never, true);
    expect(pushToStudents).toHaveBeenCalledTimes(1);
    expect(pushToStudents).toHaveBeenCalledWith("c", "k1", ["simulation"]);
    expect(r.pushed).toBe(1);
  });

  it("takes everything offline when unpublishing", async () => {
    await pushClassContent(caller, "c", [kc("k1", "Motors")] as never, false);
    expect(takeOffline).toHaveBeenCalledWith("c", "k1", ["lesson", "audio", "simulation", "practice"]);
    expect(pushToStudents).not.toHaveBeenCalled();
  });
});
