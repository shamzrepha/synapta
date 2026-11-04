import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { billingEnforced } from "@/lib/billing/plans";
import { getBillingConfig, saveBillingConfig, clearConfigCache, type BillingConfig } from "@/lib/billing/config";

export const runtime = "nodejs";

async function current(): Promise<{ cfg: BillingConfig; saved: boolean }> {
  clearConfigCache();
  const cfg = await getBillingConfig();
  return cfg ? { cfg, saved: true } : { cfg: { mode: billingEnforced() ? "all" : "off", testers: [] }, saved: false };
}

async function describe(cfg: BillingConfig) {
  const testers = await Promise.all(
    cfg.testers.map(async (uid) => {
      const d = (await adminDb().collection("users").doc(uid).get()).data() || {};
      return { uid, email: String(d.email || ""), name: String(d.displayName || "") };
    })
  );
  return testers;
}

/** The plan-limits switch: off, test accounts only, or everyone. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const { cfg, saved } = await current();
    return NextResponse.json({ ok: true, data: { mode: cfg.mode, testers: await describe(cfg), saved, envOn: billingEnforced(), paymentsReady: !!process.env.PAYSTACK_SECRET_KEY } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  mode: z.enum(["off", "testers", "all"]).optional(),
  addEmail: z.string().email().optional(),
  removeUid: z.string().min(1).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const body = await parseJson(req, schema);
    const { cfg } = await current();
    const next: BillingConfig = { mode: body.mode ?? cfg.mode, testers: [...cfg.testers] };
    if (body.addEmail) {
      let uid: string;
      try {
        uid = (await adminAuth().getUserByEmail(body.addEmail)).uid;
      } catch {
        throw new ApiError(404, "NOT_FOUND", "No account with that email.");
      }
      if (!next.testers.includes(uid)) next.testers.push(uid);
    }
    if (body.removeUid) next.testers = next.testers.filter((t) => t !== body.removeUid);
    if (next.testers.length > 50) throw new ApiError(400, "VALIDATION", "Up to 50 test accounts.");
    await saveBillingConfig(next, admin.uid);
    return NextResponse.json({ ok: true, data: { mode: next.mode, testers: await describe(next), saved: true, envOn: billingEnforced(), paymentsReady: !!process.env.PAYSTACK_SECRET_KEY } });
  } catch (error) {
    return handleAuthError(error);
  }
}
