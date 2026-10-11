import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const setGoalSchema = z.object({
  targetDate: z.string().min(8),
  minutesPerDay: z.number().int().min(5).max(360).default(30),
  goalType: z.enum(["pass_exam", "master_course", "catch_up"]).default("master_course"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classId } = await params;
    const caller = await requireUser(req);
    await assertClassAccess(caller, classId, "view");

    const body = await req.json();
    const parsed = setGoalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid goal input" } },
        { status: 400 }
      );
    }

    const { targetDate, minutesPerDay, goalType } = parsed.data;

    const profileRef = adminDb().collection("learnerProfiles").doc(caller.uid);
    const profileDoc = await profileRef.get();
    const profileData = profileDoc.exists ? profileDoc.data()! : {};

    interface GoalItem {
      classId: string;
      targetDate: string;
      minutesPerDay: number;
      goalType: "pass_exam" | "master_course" | "catch_up";
      updatedAt?: Timestamp;
    }

    const existingGoals: GoalItem[] = Array.isArray(profileData.goals) ? profileData.goals : [];
    const otherGoals = existingGoals.filter((g) => g.classId !== classId);

    const newGoal: GoalItem = {
      classId,
      targetDate,
      minutesPerDay,
      goalType,
      updatedAt: Timestamp.now(),
    };

    const updatedGoals = [...otherGoals, newGoal];

    await profileRef.set(
      {
        uid: caller.uid,
        goals: updatedGoals,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      data: {
        goal: newGoal,
        message: "Goal saved and study schedule updated.",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
