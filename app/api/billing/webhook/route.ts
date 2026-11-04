import { NextRequest, NextResponse } from "next/server";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { extendedExpiry } from "@/lib/billing/plans";
import { readCharge, verifySignature } from "@/lib/billing/paystack";

export const runtime = "nodejs";

/**
 * Paystack tells us a payment went through. Nothing here trusts the browser: the body must carry Paystack's signature, the
 * amount must cover the real price, and each payment reference is applied only once (a retried webhook changes nothing).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-paystack-signature"), secret)) return NextResponse.json({ ok: false }, { status: 401 });

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const charge = readCharge(event);
  if (!charge) return NextResponse.json({ ok: true, ignored: true }); // other events, or a payment that doesn't match a plan

  const db = adminDb();
  const payRef = db.collection("payments").doc(charge.reference);
  const userRef = db.collection("users").doc(charge.uid);
  const applied = await db.runTransaction(async (t) => {
    const [pay, user] = await Promise.all([t.get(payRef), t.get(userRef)]);
    if (pay.exists || !user.exists) return false;
    const current = (user.data()!.planExpiresAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    // paying for a different plan than the one still running starts from now instead of stacking
    const sameRunning = user.data()!.plan === charge.plan ? current : 0;
    const expires = extendedExpiry(sameRunning, charge.term);
    t.set(payRef, { ...charge, at: Timestamp.now(), expiresAt: Timestamp.fromMillis(expires) });
    t.update(userRef, { plan: charge.plan, planTerm: charge.term, planExpiresAt: Timestamp.fromMillis(expires) });
    return true;
  });
  return NextResponse.json({ ok: true, applied });
}
