import { describe, it, expect } from "vitest";
import { AiPlanSchema, buildPlan, fallbackPlan, goalProgress, replan, validateTargetDate, MAX_TASKS_PER_MILESTONE, MAX_TOTAL_TASKS, type GoalTask } from "./plan";

const ai = {
  milestones: [
    { title: "Week 1", tasks: [{ title: "a" }, { title: "b" }] },
    { title: "Week 2", tasks: [{ title: "c" }, { title: "d" }] },
  ],
};

describe("validateTargetDate", () => {
  it("rejects bad, past and far dates", () => {
    expect(validateTargetDate("nope", "2026-10-15")).toBeTruthy();
    expect(validateTargetDate("2026-10-14", "2026-10-15")).toBeTruthy();
    expect(validateTargetDate("2028-01-01", "2026-10-15")).toBeTruthy();
    expect(validateTargetDate("2026-10-15", "2026-10-15")).toBeNull();
    expect(validateTargetDate("2027-03-01", "2026-10-15")).toBeNull();
  });
});

describe("buildPlan", () => {
  it("dates every task inside its milestone window and the goal range", () => {
    const plan = buildPlan(ai, "2026-10-15", "2026-10-28");
    expect(plan.milestones).toHaveLength(2);
    expect(plan.tasks).toHaveLength(4);
    for (const t of plan.tasks) {
      const m = plan.milestones.find((x) => x.id === t.milestoneId)!;
      expect(t.dueDate >= m.startDate && t.dueDate <= m.endDate).toBe(true);
      expect(t.dueDate >= "2026-10-15" && t.dueDate <= "2026-10-28").toBe(true);
    }
    expect(plan.tasks.at(-1)!.dueDate).toBe("2026-10-28");
  });
  it("clamps milestones to the number of weeks and tasks per milestone", () => {
    const many = { milestones: Array.from({ length: 30 }, (_, i) => ({ title: `M${i}`, tasks: Array.from({ length: 20 }, (_, k) => ({ title: `t${k}` })) })) };
    const plan = buildPlan(many, "2026-10-15", "2026-10-29"); // 15 days -> 3 weeks
    expect(plan.milestones).toHaveLength(3);
    expect(plan.tasks.filter((t) => t.milestoneId === "m1")).toHaveLength(MAX_TASKS_PER_MILESTONE);
    const long = buildPlan(many, "2026-10-15", "2027-10-10");
    expect(long.tasks.length).toBeLessThanOrEqual(MAX_TOTAL_TASKS);
  });
  it("drops empty milestones, trims titles, handles a one-day goal", () => {
    const plan = buildPlan({ milestones: [{ title: "  ", tasks: [{ title: "x" }] }, { title: "Do it", tasks: [{ title: "  go  " }, { title: "" }] }] }, "2026-10-15", "2026-10-15");
    expect(plan.milestones).toHaveLength(1);
    expect(plan.tasks.map((t) => [t.title, t.dueDate])).toEqual([["go", "2026-10-15"]]);
  });
  it("fallback plan is valid", () => {
    expect(AiPlanSchema.safeParse(fallbackPlan("Physics")).success).toBe(true);
    expect(buildPlan(fallbackPlan("Physics"), "2026-10-15", "2026-12-15").tasks.length).toBeGreaterThan(3);
  });
});

describe("progress and behind detection", () => {
  const t = (id: string, dueDate: string, done = false): GoalTask => ({ id, milestoneId: "m1", title: id, dueDate, done });
  it("is on track when work is done as scheduled", () => {
    const p = goalProgress([t("a", "2026-10-10", true), t("b", "2026-10-14", true), t("c", "2026-10-20")], "2026-10-15");
    expect(p).toMatchObject({ done: 2, total: 3, pct: 67, overdue: 0, behind: false });
  });
  it("is behind when overdue tasks pile up", () => {
    const p = goalProgress([t("a", "2026-10-10"), t("b", "2026-10-12"), t("c", "2026-10-14", true), t("d", "2026-10-25")], "2026-10-15");
    expect(p.overdue).toBe(2);
    expect(p.behind).toBe(true);
  });
  it("handles empty plans", () => {
    expect(goalProgress([], "2026-10-15")).toMatchObject({ pct: 0, behind: false });
  });
});

describe("replan", () => {
  const t = (id: string, dueDate: string, done = false): GoalTask => ({ id, milestoneId: "m1", title: id, dueDate, done });
  it("spreads remaining tasks over today..target and keeps done ones", () => {
    const tasks = [t("a", "2026-10-01", true), t("b", "2026-10-05"), t("c", "2026-10-06"), t("d", "2026-10-07"), t("e", "2026-10-08")];
    const out = replan(tasks, "2026-10-15", "2026-10-18");
    expect(out[0]).toMatchObject({ id: "a", done: true, dueDate: "2026-10-01" });
    expect(out.slice(1).map((x) => x.dueDate)).toEqual(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });
  it("puts everything today when the target has passed", () => {
    const out = replan([t("a", "2026-10-01"), t("b", "2026-10-02")], "2026-10-15", "2026-10-10");
    expect(out.every((x) => x.dueDate === "2026-10-15")).toBe(true);
  });
  it("is a no-op when everything is done and never mutates the input", () => {
    const tasks = [t("a", "2026-10-01", true)];
    expect(replan(tasks, "2026-10-15", "2026-10-30")).toEqual(tasks);
    const before = JSON.stringify(tasks);
    replan(tasks, "2026-10-15", "2026-10-30");
    expect(JSON.stringify(tasks)).toBe(before);
  });
});
