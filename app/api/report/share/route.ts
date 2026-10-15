import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { buildReportNumbers, firstNameOf, getStoredNarrative, newShareToken, TOKEN_RE } from "@/lib/report/server";

export const runtime = "nodejs";

const COLLECTION = "reportShares";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection(COLLECTION).where("uid", "==", caller.uid).limit(50).get();
    const shares = snap.docs
      .filter((d) => !d.data().revoked)
      .map((d) => ({
        token: d.id,
        to: String(d.data().numbers?.to || ""),
        createdAt: (d.data().createdAt as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() || null,
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return NextResponse.json({ ok: true, data: { shares } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Snapshots the current report (numbers + saved summary, first name only) behind a random token. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "report-share", limit: 10, windowMs: 60 * 60_000 });
    if (limited) return limited;
    const [numbers, userSnap] = await Promise.all([buildReportNumbers(caller.uid), adminDb().collection("users").doc(caller.uid).get()]);
    const narrative = await getStoredNarrative(caller.uid, numbers.to);
    const token = newShareToken();
    await adminDb().collection(COLLECTION).doc(token).set({
      uid: caller.uid,
      firstName: firstNameOf(userSnap.data()?.displayName),
      numbers,
      summary: narrative?.summary || null,
      suggestion: narrative?.suggestion || null,
      revoked: false,
      createdAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, data: { token, path: `/r/${token}` } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const token = req.nextUrl.searchParams.get("token") || "";
    if (!TOKEN_RE.test(token)) throw new ApiError(400, "VALIDATION", "Invalid link.");
    const ref = adminDb().collection(COLLECTION).doc(token);
    const snap = await ref.get();
    if (!snap.exists || snap.data()!.uid !== caller.uid) throw new ApiError(404, "NOT_FOUND", "Link not found.");
    await ref.update({ revoked: true, revokedAt: Timestamp.now() });
    return NextResponse.json({ ok: true, data: { token } });
  } catch (error) {
    return handleAuthError(error);
  }
}
