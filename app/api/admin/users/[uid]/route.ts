import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminAuth, adminDb, Timestamp } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";
import { z } from "zod";

export const runtime = "nodejs";

const patchUserSchema = z.object({
  role: z.enum(["student", "teacher", "admin"]).optional(),
  disabled: z.boolean().optional(),
  monthlyTokenLimit: z.number().min(1000).max(10000000).optional(),
  roleRequest: z.enum(["none", "pending", "approved", "rejected"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid: targetUid } = await params;
    const caller = await requireUser(req, ["admin"]);
    const body = await req.json();
    const parsed = patchUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid update payload" } },
        { status: 400 }
      );
    }

    const { role, disabled, monthlyTokenLimit, roleRequest } = parsed.data;

    // Safety checks against self-lockout
    if (caller.uid === targetUid) {
      if (disabled === true) {
        return NextResponse.json(
          { ok: false, error: { code: "FORBIDDEN", message: "Cannot disable your own administrator account." } },
          { status: 400 }
        );
      }
      if (role && role !== "admin") {
        return NextResponse.json(
          { ok: false, error: { code: "FORBIDDEN", message: "Cannot remove admin role from your own account." } },
          { status: 400 }
        );
      }
    }

    const userRef = adminDb().collection("users").doc(targetUid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 }
      );
    }

    const currentData = userDoc.data()!;
    const env = getServerEnv();

    // Guard against demoting or disabling the LAST remaining admin
    const isTargetAdmin = currentData.role === "admin" && currentData.disabled !== true;
    const isDemotingOrDisablingAdmin = isTargetAdmin && (disabled === true || (role !== undefined && role !== "admin"));

    if (isDemotingOrDisablingAdmin) {
      const allAdminsSnap = await adminDb()
        .collection("users")
        .where("role", "==", "admin")
        .where("disabled", "==", false)
        .get();

      if (allAdminsSnap.size <= 1) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "FORBIDDEN",
              message: "Cannot demote or disable the last remaining active administrator.",
            },
          },
          { status: 400 }
        );
      }
    }

    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    // Role change flow: Custom Claims -> Revoke Tokens -> Token Limit -> Updates
    if (role !== undefined) {
      await adminAuth().setCustomUserClaims(targetUid, { role });
      await adminAuth().revokeRefreshTokens(targetUid);

      const effectiveTokenLimit =
        monthlyTokenLimit !== undefined
          ? monthlyTokenLimit
          : role === "teacher"
          ? env.TEACHER_TOKEN_LIMIT
          : role === "student"
          ? env.STUDENT_TOKEN_LIMIT
          : 1_000_000;

      updates.role = role;
      updates.monthlyTokenLimit = effectiveTokenLimit;
      updates.roleRequest = role === "teacher" ? "approved" : "none";
    }

    // Disable account flow
    if (disabled !== undefined) {
      await adminAuth().updateUser(targetUid, { disabled });
      if (disabled === true) {
        await adminAuth().revokeRefreshTokens(targetUid);
      }
      updates.disabled = disabled;
    }

    // Role request only flow (e.g. Rejecting a pending teacher request)
    if (roleRequest !== undefined && role === undefined) {
      updates.roleRequest = roleRequest;
    }

    if (monthlyTokenLimit !== undefined && role === undefined) {
      updates.monthlyTokenLimit = monthlyTokenLimit;
    }

    await userRef.update(updates);

    return NextResponse.json({
      ok: true,
      data: {
        uid: targetUid,
        role: role ?? currentData.role,
        roleRequest: updates.roleRequest ?? currentData.roleRequest,
        disabled: disabled ?? currentData.disabled ?? false,
        monthlyTokenLimit: updates.monthlyTokenLimit ?? currentData.monthlyTokenLimit,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
