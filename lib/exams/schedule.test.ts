import { describe, expect, it } from "vitest";
import { addDays, buildSchedule, daysBetween, daysUntil, isDayString, planProgress, rescheduleMissed, topicWeight } from "./schedule";

const today = "2026-10-15";
const topics = [{ name: "Algebra", mastery: 0.2 }, { name: "Geometry", mastery: 0.9 }, { name: "Stats" }];

describe("date helpers", () => {
  it("adds days and counts between", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(daysBetween("2026-10-15", "2026-10-25")).toBe(10);
    expect(daysUntil("2026-10-14", today)).toBe(-1);
  });
  it("validates day strings", () => {
    expect(isDayString("2026-10-15")).toBe(true);
    expect(isDayString("2026-13-40")).toBe(false);
    expect(isDayString("nope")).toBe(false);
  });
  it("weights weak topics higher", () => {
    expect(topicWeight(0)).toBe(3);
    expect(topicWeight(1)).toBe(1);
    expect(topicWeight(undefined)).toBe(2);
  });
});

describe("buildSchedule", () => {
  it("returns nothing when the exam is today or past", () => {
    expect(buildSchedule({ today, examDate: today, topics, minutesPerDay: 60 })).toEqual([]);
    expect(buildSchedule({ today, examDate: "2026-10-01", topics, minutesPerDay: 60 })).toEqual([]);
    expect(buildSchedule({ today, examDate: "2026-10-30", topics: [], minutesPerDay: 60 })).toEqual([]);
  });

  it("covers today through the day before the exam", () => {
    const plan = buildSchedule({ today, examDate: "2026-10-25", topics, minutesPerDay: 60 });
    expect(plan).toHaveLength(10);
    expect(plan[0].date).toBe(today);
    expect(plan[9].date).toBe("2026-10-24");
  });

  it("is deterministic", () => {
    const a = buildSchedule({ today, examDate: "2026-11-10", topics, minutesPerDay: 90 });
    const b = buildSchedule({ today, examDate: "2026-11-10", topics, minutesPerDay: 90 });
    expect(a).toEqual(b);
  });

  it("gives weak topics more total time", () => {
    const plan = buildSchedule({ today, examDate: "2026-11-10", topics, minutesPerDay: 90 });
    const mins = (name: string) => plan.flatMap((d) => d.items).filter((i) => i.topic === name).reduce((s, i) => s + i.minutes, 0);
    expect(mins("Algebra")).toBeGreaterThan(mins("Geometry"));
  });

  it("starts every topic with a learn session before any review of it", () => {
    const plan = buildSchedule({ today, examDate: "2026-11-10", topics, minutesPerDay: 90 });
    for (const t of topics) {
      const flat = plan.flatMap((d, di) => d.items.filter((i) => i.topic === t.name).map((i) => ({ ...i, di })));
      const learn = flat.filter((i) => i.kind === "learn");
      expect(learn).toHaveLength(1);
      for (const r of flat.filter((i) => i.kind === "review")) expect(r.di).toBeGreaterThan(learn[0].di);
    }
  });

  it("puts a review on the last day and respects the daily cap when possible", () => {
    const plan = buildSchedule({ today, examDate: "2026-11-10", topics, minutesPerDay: 120 });
    expect(plan[plan.length - 1].items.some((i) => i.kind === "review")).toBe(true);
    for (const d of plan) expect(d.items.reduce((s, i) => s + i.minutes, 0)).toBeLessThanOrEqual(120);
  });

  it("handles a single study day", () => {
    const plan = buildSchedule({ today, examDate: "2026-10-16", topics, minutesPerDay: 60 });
    expect(plan).toHaveLength(1);
    expect(plan[0].items.length).toBe(3);
  });

  it("produces unique item ids", () => {
    const plan = buildSchedule({ today, examDate: "2026-12-20", topics, minutesPerDay: 120 });
    const ids = plan.flatMap((d) => d.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ignores blank and duplicate topics", () => {
    const plan = buildSchedule({ today, examDate: "2026-10-25", topics: [{ name: "A" }, { name: " a " }, { name: "" }], minutesPerDay: 60 });
    expect(new Set(plan.flatMap((d) => d.items.map((i) => i.topic))).size).toBe(1);
  });
});

describe("rescheduleMissed", () => {
  const plan = buildSchedule({ today, examDate: "2026-10-25", topics, minutesPerDay: 90 });

  it("moves unfinished past items into remaining days and keeps done ones", () => {
    const later = "2026-10-18";
    const doneId = plan[0].items[0].id;
    const done: Record<string, boolean> = { [doneId]: true };
    const missedCount = plan.filter((d) => d.date < later).flatMap((d) => d.items).filter((i) => !done[i.id]).length;
    const out = rescheduleMissed({ plan, done, today: later, minutesPerDay: 90 });
    const past = out.filter((d) => d.date < later).flatMap((d) => d.items);
    expect(past.map((i) => i.id)).toEqual([doneId]);
    expect(out.flatMap((d) => d.items)).toHaveLength(plan.flatMap((d) => d.items).length);
    const futureBefore = plan.filter((d) => d.date >= later).flatMap((d) => d.items).length;
    expect(out.filter((d) => d.date >= later).flatMap((d) => d.items)).toHaveLength(futureBefore + missedCount);
  });

  it("is a no-op when nothing is missed or no days remain", () => {
    expect(rescheduleMissed({ plan, done: {}, today, minutesPerDay: 90 })).toEqual(plan);
    expect(rescheduleMissed({ plan, done: {}, today: "2026-12-01", minutesPerDay: 90 })).toEqual(plan);
  });
});

describe("planProgress", () => {
  it("counts done, minutes and missed", () => {
    const plan = [
      { date: "2026-10-14", items: [{ id: "a", topic: "A", minutes: 30, kind: "learn" as const }, { id: "b", topic: "B", minutes: 30, kind: "learn" as const }] },
      { date: "2026-10-15", items: [{ id: "c", topic: "A", minutes: 40, kind: "review" as const }] },
    ];
    const p = planProgress(plan, { a: true }, "2026-10-15");
    expect(p).toMatchObject({ totalItems: 3, doneItems: 1, totalMinutes: 100, doneMinutes: 30, missedItems: 1, percent: 30 });
  });
});
