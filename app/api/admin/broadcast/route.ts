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

    const snap = await adminDb().collection("users").where("disabled", "==", false).limit(1000).get();
    if (snap.empty) {
      return NextResponse.json({ ok: true, data: { deliveredCount: 0, message: "No matching users found." } });
    }

    const instFilter = b.filters?.institution?.trim().toLowerCase() || "";
    const instAcronymMatch = instFilter.match(/\(([^)]+)\)/);
    const instAcronym = instAcronymMatch ? instAcronymMatch[1].toLowerCase() : "";
    const deptFilter = b.filters?.department?.trim().toLowerCase() || "";
    const levelFilter = b.filters?.level?.trim().toLowerCase() || "";
    const interestFilter = b.filters?.interest?.trim() || "";

    const matchedDocs = snap.docs.filter((doc) => {
      if (b.target !== "selective" || !b.filters) return true;
      const u = doc.data() || {};

      if (instFilter) {
        const userInst = String(u.institution || "").toLowerCase();
        if (!userInst) return false;
        const matchesFull = userInst.includes(instFilter) || instFilter.includes(userInst);
        const matchesAcronym = instAcronym ? userInst.includes(instAcronym) : false;
        if (!matchesFull && !matchesAcronym) return false;
      }

      if (deptFilter) {
        const userDept = String(u.department || "").toLowerCase();
        if (!userDept.includes(deptFilter)) return false;
      }

      if (levelFilter) {
        const userLevel = String(u.level || "").toLowerCase();
        if (userLevel !== levelFilter) return false;
      }

      if (interestFilter) {
        const userInterests = Array.isArray(u.interests) ? u.interests : [];
        if (!userInterests.includes(interestFilter)) return false;
      }

      return true;
    });

    if (matchedDocs.length === 0) {
      return NextResponse.json({ ok: true, data: { deliveredCount: 0, message: "No matching users found for those filters." } });
    }

    const now = Timestamp.now();
    let count = 0;
    const CHUNK_SIZE = 400;

    for (let i = 0; i < matchedDocs.length; i += CHUNK_SIZE) {
      const chunk = matchedDocs.slice(i, i + CHUNK_SIZE);
      const batch = adminDb().batch();
      for (const doc of chunk) {
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
          createdAt: now,
        });
        count++;
      }
      await batch.commit();
    }

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
