import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { activatePayment } from "@/lib/billing/activate";
import { readTransaction } from "@/lib/billing/paystack";

export const runtime = "nodejs";

/**
 * The learner is back from Paystack's page. We ask Paystack directly whether that payment succeeded (using our secret key,
 * never what the browser claims), so the plan switches on straight away even if the webhook is a few seconds late.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "billing_verify", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const reference = (req.nextUrl.searchParams.get("reference") || "").trim();
    if (!/^[A-Za-z0-9_.=-]{6,100}$/.test(reference)) throw new ApiError(400, "VALIDATION", "Missing payment reference.");
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new ApiError(503, "PAYMENTS_UNAVAILABLE", "Payments aren't set up yet.");

    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) });
    const j = (await res.json().catch(() => null)) as { status?: boolean; data?: Parameters<typeof readTransaction>[0] } | null;
    if (!res.ok || !j?.status) throw new ApiError(502, "PAYMENTS_UNAVAILABLE", "Couldn't confirm the payment yet. It will appear shortly.");
    const charge = readTransaction(j.data);
    if (!charge) return NextResponse.json({ ok: true, data: { paid: false } });
    // a payment made by someone else can't be claimed here
    if (charge.uid !== caller.uid) throw new ApiError(403, "FORBIDDEN", "That payment belongs to another account.");
    await activatePayment(charge);
    return NextResponse.json({ ok: true, data: { paid: true, plan: charge.plan } });
  } catch (error) {
    return handleAuthError(error);
  }
}
