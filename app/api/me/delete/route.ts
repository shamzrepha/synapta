import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { deleteUserData, findOwnedClasses } from "@/lib/privacy/delete-user";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The sign-in must be this fresh (seconds) for an account to be deleted. */
const RECENT_LOGIN_SECONDS = 300;

const schema = z.object({
  /** the learner types their own username to confirm */
  confirm: z.string().trim().min(1).max(60),
});

/**
 * Permanently deletes the caller's account and personal data (see lib/privacy/delete-user.ts for what is kept and why).
 * Needs: the username typed as confirmation, a sign-in within the last 5 minutes (Bearer ID token), and no classes they teach.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "account_delete", limit: 3, windowMs: 3_600_000, shared: true });
    if (limited) return limited;
    const { confirm } = await parseJson(req, schema);

    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) throw new ApiError(401, "REAUTH_REQUIRED", "Please confirm it's you: sign in again, then try once more.");
    const decoded = await adminAuth().verifyIdToken(bearer, true);
    if (decoded.uid !== caller.uid || Date.now() / 1000 - Number(decoded.auth_time || 0) > RECENT_LOGIN_SECONDS) {
      throw new ApiError(401, "REAUTH_REQUIRED", "Please confirm it's you: sign in again, then try once more.");
    }

    const db = adminDb();
    const userDoc = await db.collection("users").doc(caller.uid).get();
    const username = String(userDoc.data()?.username || "").toLowerCase();
    if (!username || confirm.toLowerCase().replace(/^@/, "") !== username) {
      throw new ApiError(400, "CONFIRM_MISMATCH", "Type your username exactly to confirm.");
    }

    if (caller.role !== "admin") {
      const owned = await findOwnedClasses(db, caller.uid);
      if (owned.length > 0) {
        throw new ApiError(409, "OWNS_CLASSES", `You teach ${owned.length} class${owned.length === 1 ? "" : "es"} (${owned.slice(0, 3).map((c) => c.name).join(", ")}). Transfer or delete ${owned.length === 1 ? "it" : "them"} first, then delete your account.`);
      }
    }

    const report = await deleteUserData(db, caller.uid);
    if (report.errors.length > 0) {
      console.error("[me/delete] partial failure", caller.uid, report.errors);
      throw new ApiError(500, "DELETE_INCOMPLETE", "We couldn't finish deleting everything. Your account is still open: please try again.");
    }

    await adminAuth().revokeRefreshTokens(caller.uid).catch(() => null);
    await adminAuth().deleteUser(caller.uid).catch((e: { code?: string }) => {
      if (e?.code !== "auth/user-not-found") throw e;
    });

    const res = NextResponse.json({ ok: true, data: { deleted: true, counts: report.counts } });
    res.cookies.set({ name: "__session", value: "", maxAge: 0, path: "/", httpOnly: true });
    return res;
  } catch (error) {
    return handleAuthError(error);
  }
}
