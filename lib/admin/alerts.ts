/** What needs an admin's attention right now, built from a few live counts. Pure so it is easy to test. */
export type AlertLevel = "danger" | "warning" | "info";

export interface AdminAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  href: string;
}

export interface AlertCounts {
  teacherRequests: number;
  bugReports: number;
  paymentsToday: number;
  revenueTodayNgn: number;
  plansEndingSoon: number;
  aiPaused: boolean;
  noticeLive: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const ORDER: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2 };

export function buildAlerts(c: AlertCounts): AdminAlert[] {
  const out: AdminAlert[] = [];
  if (c.aiPaused) out.push({ id: "ai-paused", level: "danger", title: "AI is paused for everyone", detail: "Students and teachers can't use any AI feature until you turn it back on.", href: "/admin/controls" });
  if (c.teacherRequests > 0) out.push({ id: "teacher-requests", level: "warning", title: `${plural(c.teacherRequests, "teacher request", "teacher requests")} waiting`, detail: "People asked to become teachers. Review and approve or reject.", href: "/admin" });
  if (c.bugReports > 0) out.push({ id: "bug-reports", level: "warning", title: `${plural(c.bugReports, "problem report", "problem reports")} not looked at`, detail: "Reports sent in from the app are waiting for a status.", href: "/admin" });
  if (c.plansEndingSoon > 0) out.push({ id: "plans-ending", level: "warning", title: `${plural(c.plansEndingSoon, "plan ends", "plans end")} within 3 days`, detail: "Filter People by 'Plan ends within 7 days' to see who.", href: "/admin/billing" });
  if (c.paymentsToday > 0) out.push({ id: "payments-today", level: "info", title: `${plural(c.paymentsToday, "payment", "payments")} in the last 24 hours`, detail: `${naira(c.revenueTodayNgn)} received.`, href: "/admin/billing" });
  if (c.noticeLive) out.push({ id: "notice-live", level: "info", title: "A notice is showing to everyone", detail: "Remove it from Site controls when it is no longer needed.", href: "/admin/controls" });
  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
