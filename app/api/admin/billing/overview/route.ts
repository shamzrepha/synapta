import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { currentPeriod } from "@/lib/billing/plans";

export const runtime = "nodejs";

const ms = (v: unknown) => (v as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;

/** Everything an admin needs to follow the money: payments, revenue, and who is on which plan right now. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const db = adminDb();
    const now = Date.now();
    const [paySnap, subSnap] = await Promise.all([
      db.collection("payments").orderBy("at", "desc").limit(300).get(),
      db.collection("users").where("planExpiresAt", ">", Timestamp.fromMillis(now)).limit(2000).get(),
    ]);

    const period = currentPeriod();
    const payments = paySnap.docs.map((d) => {
      const x = d.data();
      return {
        reference: d.id,
        uid: String(x.uid || ""),
        name: String(x.name || ""),
        email: String(x.email || ""),
        plan: String(x.plan || ""),
        term: String(x.term || ""),
        channel: String(x.channel || ""),
        amountNgn: Math.round((Number(x.amountKobo) || 0) / 100),
        at: new Date(ms(x.at)).toISOString(),
        expiresAt: new Date(ms(x.expiresAt)).toISOString(),
      };
    });
    const thisMonth = payments.filter((p) => p.at.slice(0, 7) === period);
    const sum = (list: typeof payments) => list.reduce((s, p) => s + p.amountNgn, 0);

    const byPlan: Record<string, number> = {};
    let expiringSoon = 0;
    const subscribers = subSnap.docs.map((d) => {
      const x = d.data();
      const plan = String(x.plan || "");
      byPlan[plan] = (byPlan[plan] || 0) + 1;
      const exp = ms(x.planExpiresAt);
      if (exp - now < 7 * 86_400_000) expiringSoon++;
      return { uid: d.id, name: String(x.displayName || ""), email: String(x.email || ""), plan, expiresAt: new Date(exp).toISOString(), grantedByAdmin: !!x.planGrantedBy };
    });

    return NextResponse.json({
      ok: true,
      data: {
        totals: { allTimeNgn: sum(payments), thisMonthNgn: sum(thisMonth), paymentCount: payments.length, paymentsThisMonth: thisMonth.length, showingLatest: payments.length >= 300 },
        subscribers: { active: subscribers.length, byPlan, expiringSoon },
        payments,
        activeSubscribers: subscribers.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)).slice(0, 200),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
