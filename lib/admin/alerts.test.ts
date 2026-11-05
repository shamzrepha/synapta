import { describe, it, expect } from "vitest";
import { buildAlerts, type AlertCounts } from "./alerts";

const none: AlertCounts = { teacherRequests: 0, bugReports: 0, paymentsToday: 0, revenueTodayNgn: 0, plansEndingSoon: 0, aiPaused: false, noticeLive: false };

describe("admin alerts", () => {
  it("is empty when nothing needs attention", () => {
    expect(buildAlerts(none)).toEqual([]);
  });
  it("puts what is urgent first and says it in plain words", () => {
    const a = buildAlerts({ ...none, teacherRequests: 2, paymentsToday: 1, revenueTodayNgn: 2500, aiPaused: true });
    expect(a.map((x) => x.id)).toEqual(["ai-paused", "teacher-requests", "payments-today"]);
    expect(a[1].title).toBe("2 teacher requests waiting");
    expect(a[2].detail).toBe("₦2,500 received.");
  });
  it("uses singular and plural correctly", () => {
    expect(buildAlerts({ ...none, bugReports: 1 })[0].title).toBe("1 problem report not looked at");
    expect(buildAlerts({ ...none, plansEndingSoon: 1 })[0].title).toBe("1 plan ends within 3 days");
    expect(buildAlerts({ ...none, plansEndingSoon: 4 })[0].title).toBe("4 plans end within 3 days");
  });
});
