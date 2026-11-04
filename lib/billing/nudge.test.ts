import { describe, it, expect } from "vitest";
import { pickNudge, type NudgeInfo } from "./nudge";
import { PLANS } from "./plans";

const wire = (id: keyof typeof PLANS) => ({ id, label: PLANS[id].label, limits: Object.fromEntries(Object.entries(PLANS[id].limits).map(([k, v]) => [k, Number.isFinite(v) ? v : null])) as NudgeInfo["plan"]["limits"] });
const zero = { notes: 0, scan_pages: 0, lessons: 0, practice: 0, studio_ai: 0, class_build: 0 };
const me = (over: Partial<NudgeInfo> = {}): NudgeInfo => ({ enforced: true, paid: false, plan: wire("free"), usage: zero, resetAt: 0, ...over });

describe("which upgrade notice to show", () => {
  it("shows nothing at all while plan limits don't apply to this person", () => {
    expect(pickNudge(me({ enforced: false, usage: { ...zero, notes: 3 } }), "u1")).toBeNull();
  });
  it("welcomes a free user once, naming the plan to move up to", () => {
    const n = pickNudge(me(), "u1")!;
    expect(n.title).toBe("You're on the Free plan");
    expect(n.message).toContain("Plus");
    expect(n.everyDay).toBe(false);
    expect(n.key).toBe("welcome:u1:0");
  });
  it("warns at 80% used, naming how much is used and the next plan", () => {
    const n = pickNudge(me({ usage: { ...zero, notes: 3 } }), "u1")!;
    expect(n.title).toBe("You've used it all");
    expect(n.message).toContain("3 of 3 study notes sets");
    expect(n.message).toContain("Upgrade to Plus");
    expect(pickNudge(me({ usage: { ...zero, practice: 4 } }), "u1")!.title).toBe("Running low");
    expect(pickNudge(me({ usage: { ...zero, practice: 3 } }), "u1")!.title).toBe("You're on the Free plan");
  });
  it("picks the most used feature when several are low", () => {
    const n = pickNudge(me({ usage: { ...zero, notes: 3, scan_pages: 12 } }), "u1")!;
    expect(n.message).toContain("study notes sets");
  });
  it("moves a Plus user up to Pro and a paid user with room gets nothing", () => {
    const plus = me({ paid: true, plan: wire("plus"), usage: { ...zero, notes: 45 } });
    expect(pickNudge(plus, "u1")!.message).toContain("Upgrade to Pro");
    expect(pickNudge(me({ paid: true, plan: wire("plus") }), "u1")).toBeNull();
  });
  it("has nothing to offer at the top of the ladder", () => {
    expect(pickNudge(me({ paid: true, plan: wire("ultra"), usage: { ...zero, scan_pages: 5900 } }), "u1")).toBeNull();
  });
  it("shows the notices again after an admin resets a test account", () => {
    expect(pickNudge(me({ resetAt: 111 }), "u1")!.key).not.toBe(pickNudge(me({ resetAt: 0 }), "u1")!.key);
  });
  it("moves an unpaid teacher up to the Teacher plan", () => {
    const trial = me({ plan: { ...wire("free"), label: "Free (teacher trial)" } });
    expect(pickNudge(trial, "t1")!.message).toContain("Teacher");
  });
});
