import { NextRequest, NextResponse } from "next/server";
import { activatePayment } from "@/lib/billing/activate";
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

  const applied = await activatePayment(charge);
  return NextResponse.json({ ok: true, applied });
}
