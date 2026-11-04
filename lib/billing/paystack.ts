import crypto from "node:crypto";
import { PAYABLE, priceFor, type PlanId } from "./plans";

/** Paystack's webhook signature: HMAC-SHA512 of the raw body with the secret key, as hex. Compared in constant time. */
export function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface PaidCharge {
  reference: string;
  uid: string;
  plan: PlanId;
  term: "month" | "term";
  /** what was actually paid, in kobo, and how (card, bank, ussd, ...), for the admin's records */
  amountKobo: number;
  channel: string;
  email: string;
}

/** Every way Paystack can take money in Nigeria is switched on for checkout. */
export const PAYSTACK_CHANNELS = ["card", "bank", "ussd", "bank_transfer", "qr", "mobile_money", "apple_pay"] as const;

/**
 * Reads a `charge.success` event and returns what to activate, or null when it isn't a valid payment for one of our
 * plans: wrong event, wrong currency, a plan we don't sell, or an amount below the real price (so nobody can pay ₦100
 * for a ₦6,500 plan by editing the checkout).
 */
export function readCharge(event: unknown): PaidCharge | null {
  const e = event as { event?: string; data?: { status?: string; reference?: string; amount?: number; currency?: string; channel?: string; customer?: { email?: string }; metadata?: Record<string, unknown> } };
  if (e?.event !== "charge.success" || e.data?.status !== "success") return null;
  return readTransaction(e.data);
}

/** Same checks for a transaction object, which is what Paystack's verify call returns. */
export function readTransaction(d: { status?: string; reference?: string; amount?: number; currency?: string; channel?: string; customer?: { email?: string }; metadata?: Record<string, unknown> } | undefined): PaidCharge | null {
  if (!d || d.status !== "success") return null;
  const m = d.metadata || {};
  const plan = m.plan as PlanId;
  const term = m.term === "term" ? "term" : m.term === "month" ? "month" : null;
  if (!d.reference || typeof m.uid !== "string" || !m.uid || !PAYABLE.includes(plan) || !term) return null;
  if (d.currency !== "NGN") return null;
  if (typeof d.amount !== "number" || d.amount < priceFor(plan, term) * 100) return null;
  return { reference: d.reference, uid: m.uid, plan, term, amountKobo: d.amount, channel: String(d.channel || "unknown").slice(0, 30), email: String(d.customer?.email || "").slice(0, 120) };
}
