import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { recommendClassPlan } from "@/lib/teacher/recommend";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(1).max(80),
  description: z.string().trim().max(3000).default(""),
  level: z.string().max(40).default("undergrad"),
  durationWeeks: z.number().int().min(1).max(52).default(4),
  seedText: z.string().max(100000).optional(),
  classId: z.string().optional(),
});

/** AI recommendations for an interactive classroom (works before a class exists, or for one with uploads). */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await parseJson(req, schema);
    if (body.classId) await assertClassAccess(caller, body.classId, "mutate");
    const plan = await recommendClassPlan({
      userId: caller.uid,
      title: body.title,
      subject: body.subject,
      description: body.description ?? "",
      level: body.level ?? "undergrad",
      durationWeeks: body.durationWeeks ?? 4,
      seedText: body.seedText,
      classId: body.classId,
    });
    if (body.classId) {
      // Keep the latest plan on the class so the teacher can come back to it
      await adminDb().collection("classes").doc(body.classId).update({ recommendedPlan: plan, recommendedAt: Timestamp.now() }).catch(() => null);
    }
    return NextResponse.json({ ok: true, data: plan });
  } catch (error) {
    return handleAuthError(error);
  }
}
