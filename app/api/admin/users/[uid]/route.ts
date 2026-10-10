import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminAuth, adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const patchUserSchema = z.object({
  role: z.enum(["student", "teacher", "admin"]).optional(),
  disabled: z.boolean().optional(),
  monthlyTokenLimit: z.number().min(1000).max(10000000).optional(),
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

    const { role, disabled, monthlyTokenLimit } = parsed.data;

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

    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (role !== undefined) {
      updates.role = role;
      try {
        await adminAuth().setCustomUserClaims(targetUid, { role });
      } catch (authErr) {
        console.warn("Failed to set custom claim in Firebase Auth:", authErr);
      }
    }

    if (disabled !== undefined) {
      updates.disabled = disabled;
      try {
        await adminAuth().updateUser(targetUid, { disabled });
      } catch (authErr) {
        console.warn("Failed to update disabled state in Firebase Auth:", authErr);
      }
    }

    if (monthlyTokenLimit !== undefined) {
      updates.monthlyTokenLimit = monthlyTokenLimit;
    }

    await userRef.update(updates);

    return NextResponse.json({
      ok: true,
      data: {
        uid: targetUid,
        role: role ?? userDoc.data()?.role,
        disabled: disabled ?? userDoc.data()?.disabled ?? false,
        monthlyTokenLimit: monthlyTokenLimit ?? userDoc.data()?.monthlyTokenLimit,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
