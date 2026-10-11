import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { FieldPath } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Admin role strictly enforced
    await requireUser(req, ["admin"]);

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase().trim() || "";
    const roleFilter = searchParams.get("role") || "";
    const roleRequestFilter = searchParams.get("roleRequest") || "";
    const limitParam = parseInt(searchParams.get("limit") || "100", 10);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 100 : limitParam, 1), 100);
    const cursor = searchParams.get("cursor");

    let queryRef: FirebaseFirestore.Query = adminDb().collection("users");

    if (roleFilter && ["student", "teacher", "admin"].includes(roleFilter)) {
      queryRef = queryRef.where("role", "==", roleFilter);
    }
    if (roleRequestFilter) {
      queryRef = queryRef.where("roleRequest", "==", roleRequestFilter);
    }

    queryRef = queryRef.orderBy(FieldPath.documentId());

    if (cursor) {
      queryRef = queryRef.startAfter(cursor);
    }

    // Fetch limit + 1 to check if there is a next page
    queryRef = queryRef.limit(limit + 1);

    const usersSnap = await queryRef.get();
    const hasMore = usersSnap.docs.length > limit;
    const docs = hasMore ? usersSnap.docs.slice(0, limit) : usersSnap.docs;
    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    let users = docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        displayName: data.displayName || "Unknown",
        email: data.email || "No email",
        role: data.role || "student",
        roleRequest: data.roleRequest || null,
        disabled: Boolean(data.disabled),
        xp: typeof data.xp === "number" ? data.xp : 0,
        streakDays: typeof data.streakDays === "number" ? data.streakDays : 1,
        monthlyTokensUsed: typeof data.monthlyTokensUsed === "number" ? data.monthlyTokensUsed : 0,
        monthlyTokenLimit: typeof data.monthlyTokenLimit === "number" ? data.monthlyTokenLimit : 50000,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        lastActiveDate: data.lastActiveDate || null,
      };
    });

    if (query) {
      users = users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          u.uid.toLowerCase().includes(query)
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        users,
        total: users.length,
        nextCursor,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

