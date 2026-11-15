import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { parseJson } from "@/lib/api/errors";

export const runtime = "nodejs";

const broadcastSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(500),
  href: z.string().trim().max(200).optional().default("/dashboard"),
  icon: z.string().trim().max(40).optional().default("bell"),
  sproutMood: z.enum(["idle", "wave", "jump", "dance", "think", "search"]).optional().default("jump"),
  target: z.enum(["all", "selective"]).default("all"),
  filters: z
    .object({
      institution: z.string().trim().max(100).optional(),
      department: z.string().trim().max(100).optional(),
      level: z.string().trim().max(40).optional(),
      interest: z.string().trim().max(60).optional(),
    })
    .optional(),
});

/**
 * Admin Targeted Broadcast & Auto-Dispatcher
 * Pushes alerts to all users or selectively based on school, level, department, or interest.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["admin"]);
    const b = await parseJson(req, broadcastSchema);

    let query: FirebaseFirestore.Query = adminDb().collection("users").where("disabled", "==", false);

    if (b.target === "selective" && b.filters) {
      if (b.filters.institution) {
        query = query.where("institution", "==", b.filters.institution);
      }
      if (b.filters.department) {
        query = query.where("department", "==", b.filters.department);
      }
      if (b.filters.level) {
        query = query.where("level", "==", b.filters.level);
      }
      if (b.filters.interest) {
        query = query.where("interests", "array-contains", b.filters.interest);
      }
    }

    const snap = await query.limit(500).get();
    if (snap.empty) {
      return NextResponse.json({ ok: true, data: { deliveredCount: 0, message: "No matching users found." } });
    }

    const batch = adminDb().batch();
    let count = 0;

    for (const doc of snap.docs) {
      const notifRef = adminDb().collection("users").doc(doc.id).collection("notifications").doc();
      batch.set(notifRef, {
        type: "broadcast",
        title: b.title,
        body: b.body,
        href: b.href,
        icon: b.icon,
        sproutMood: b.sproutMood,
        read: false,
        senderUid: caller.uid,
        createdAt: Timestamp.now(),
      });
      count++;
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      data: {
        deliveredCount: count,
        message: `Successfully delivered notification to ${count} user${count === 1 ? "" : "s"}.`,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
