import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Admin role strictly enforced
    await requireUser(req, ["admin"]);

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase().trim() || "";
    const roleFilter = searchParams.get("role") || "";

    const usersSnap = await adminDb().collection("users").get();

    let users = usersSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        displayName: data.displayName || "Unknown",
        email: data.email || "No email",
        role: data.role || "student",
        disabled: Boolean(data.disabled),
        xp: typeof data.xp === "number" ? data.xp : 0,
        streakDays: typeof data.streakDays === "number" ? data.streakDays : 1,
        monthlyTokensUsed: typeof data.monthlyTokensUsed === "number" ? data.monthlyTokensUsed : 0,
        monthlyTokenLimit: typeof data.monthlyTokenLimit === "number" ? data.monthlyTokenLimit : 50000,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        lastActiveDate: data.lastActiveDate || null,
      };
    });

    if (roleFilter && ["student", "teacher", "admin"].includes(roleFilter)) {
      users = users.filter((u) => u.role === roleFilter);
    }

    if (query) {
      users = users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          u.uid.toLowerCase().includes(query)
      );
    }

    // Sort by XP descending by default
    users.sort((a, b) => b.xp - a.xp);

    return NextResponse.json({
      ok: true,
      data: {
        users,
        total: users.length,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
