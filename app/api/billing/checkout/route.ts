import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { PAYABLE, priceFor, type PlanId } from "@/lib/billing/plans";

export const runtime = "nodejs";

const schema = z.object({ plan: z.enum(["plus", "teacher"]), term: z.enum(["month", "term"]) });

/** Starts a Paystack payment for a plan and returns the page to send the learner to. The plan is only activated by the signed webhook. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "billing_checkout", limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const { plan, term } = await parseJson(req, schema);
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new ApiError(503, "PAYMENTS_UNAVAILABLE", "Payments aren't set up yet. Please try again soon.");
    if (!PAYABLE.includes(plan as PlanId)) throw new ApiError(400, "VALIDATION", "That plan can't be bought online.");
    if (!caller.email) throw new ApiError(400, "VALIDATION", "Add an email address to your account before paying.");
    if (caller.role !== "admin" && plan === "teacher" && caller.role !== "teacher") throw new ApiError(403, "FORBIDDEN", "The Teacher plan is for teacher accounts. Ask to become a teacher first.");

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: caller.email,
        amount: priceFor(plan as PlanId, term) * 100,
        currency: "NGN",
        callback_url: `${req.nextUrl.origin}/plans?paid=1`,
        metadata: { uid: caller.uid, plan, term },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => null)) as { status?: boolean; data?: { authorization_url?: string } } | null;
    if (!res.ok || !j?.status || !j.data?.authorization_url) throw new ApiError(502, "PAYMENTS_UNAVAILABLE", "Couldn't start the payment. Please try again.");
    return NextResponse.json({ ok: true, data: { url: j.data.authorization_url } });
  } catch (error) {
    return handleAuthError(error);
  }
}
