import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { getSiteConfig } from "@/lib/config/site";
import { buildAlerts } from "@/lib/admin/alerts";

export const runtime = "nodejs";

/** Counts are capped, so a very busy day costs a bounded number of reads. A count that can't be read is left out, not shown as zero trouble. */
async function count(q: FirebaseFirestore.Query): Promise<number> {
  try {
    return (await q.limit(100).get()).size;
  } catch {
    return 0;
  }
}

/** What needs an admin's attention right now. */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const limited = await checkRateLimit(req, { uid: admin.uid, keyPrefix: "admin_alerts", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const db = adminDb();
    const now = Date.now();
    const [teacherRequests, bugReports, ending, site] = await Promise.all([
      count(db.collection("users").where("roleRequest", "==", "pending")),
      count(db.collection("bugReports").where("status", "==", "pending")),
      count(db.collection("users").where("planExpiresAt", ">=", Timestamp.fromMillis(now)).where("planExpiresAt", "<=", Timestamp.fromMillis(now + 3 * 86_400_000))),
      getSiteConfig(),
    ]);
    let paymentsToday = 0;
    let revenue = 0;
    try {
      const pays = await db.collection("payments").where("at", ">=", Timestamp.fromMillis(now - 86_400_000)).limit(100).get();
      paymentsToday = pays.size;
      revenue = pays.docs.reduce((s, d) => s + (Number(d.data().amountKobo) || 0) / 100, 0);
    } catch {
      // leave payments out if they can't be read
    }
    const alerts = buildAlerts({ teacherRequests, bugReports, paymentsToday, revenueTodayNgn: revenue, plansEndingSoon: ending, aiPaused: site.aiPaused, noticeLive: !!site.notice });
    return NextResponse.json({ ok: true, data: { alerts } });
  } catch (error) {
    return handleAuthError(error);
  }
}
