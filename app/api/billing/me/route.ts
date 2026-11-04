import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { FEATURES, plansForRole, type Plan } from "@/lib/billing/plans";
import { isEnforced } from "@/lib/billing/config";
import { usageOf } from "@/lib/billing/usage";

export const runtime = "nodejs";

// Infinity is not valid JSON: "no cap" is sent as null
const wire = (p: Plan) => ({ ...p, limits: Object.fromEntries(FEATURES.map((f) => [f, Number.isFinite(p.limits[f]) ? p.limits[f] : null])) });

/** The caller's plan, this month's usage against it, and the plans on offer. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const { data, plan, usage, period } = await usageOf(caller.uid);
    const enforced = await isEnforced(caller.uid);
    const expires = (data.planExpiresAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null;
    return NextResponse.json({
      ok: true,
      data: {
        period,
        enforced,
        paymentsReady: !!process.env.PAYSTACK_SECRET_KEY,
        plan: wire(plan),
        planExpiresAt: expires && expires > Date.now() ? new Date(expires).toISOString() : null,
        paid: !!data.plan && !!expires && expires > Date.now(),
        resetAt: (data.usageResetAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
        usage: Object.fromEntries(FEATURES.map((f) => [f, usage[f] || 0])),
        tokens: { used: (data.usagePeriod || "") === period ? data.monthlyTokensUsed || 0 : 0, limit: Math.max(data.monthlyTokenLimit || 0, enforced ? plan.monthlyTokens : 0) || plan.monthlyTokens },
        // a student sees the student ladder; teachers and admins see the teacher ladder as well
        plans: plansForRole(caller.role).map(wire),
        role: caller.role,
        grant: data.planGrant ? { kind: String(data.planGrant.kind || ""), note: String(data.planGrant.note || "") } : null,
        isAdmin: caller.role === "admin",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
