import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  username: z
    .string()
    .min(3)
    .max(25)
    .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores")
    .optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { displayName, username } = parsed.data;
    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (displayName) {
      updates.displayName = displayName.trim();
    }

    if (username) {
      const cleanUsername = username.toLowerCase().trim();

      // Check if username is already taken by another user
      const existingUserSnap = await adminDb()
        .collection("users")
        .where("username", "==", cleanUsername)
        .limit(1)
        .get();

      if (!existingUserSnap.empty && existingUserSnap.docs[0].id !== caller.uid) {
        return NextResponse.json(
          { ok: false, error: { code: "USERNAME_TAKEN", message: "This username is already taken. Please choose another." } },
          { status: 409 }
        );
      }

      updates.username = cleanUsername;
    }

    await adminDb().collection("users").doc(caller.uid).update(updates);

    return NextResponse.json({
      ok: true,
      data: {
        message: "Profile updated successfully!",
        updates,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
