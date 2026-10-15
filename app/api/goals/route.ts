import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { generateWithFallback } from "@/lib/ai/router";
import { dayIdFor } from "@/lib/game/quests";
import { dayDiff } from "@/lib/streak/logic";
import { AiPlanSchema, buildPlan, fallbackPlan, goalProgress, replan, validateTargetDate, type GoalMilestone, type GoalTask } from "@/lib/goals/plan";
import { GOAL_PLAN_SYSTEM, goalPlanPrompt } from "@/lib/goals/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const COLLECTION = "studyGoals";

function view(id: string, d: FirebaseFirestore.DocumentData, today: string) {
  const tasks = (Array.isArray(d.tasks) ? d.tasks : []) as GoalTask[];
  return {
    id,
    title: String(d.title || ""),
    targetDate: String(d.targetDate || ""),
    startDate: String(d.startDate || ""),
    reminders: !!d.reminders,
    milestones: (Array.isArray(d.milestones) ? d.milestones : []) as GoalMilestone[],
    tasks,
    progress: goalProgress(tasks, today),
    createdAt: (d.createdAt as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() || null,
  };
}

async function ownGoal(uid: string, id: string) {
  const ref = adminDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.uid !== uid) throw new ApiError(404, "NOT_FOUND", "Goal not found.");
  return { ref, data: snap.data()! };
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const today = dayIdFor();
    const snap = await adminDb().collection(COLLECTION).where("uid", "==", caller.uid).limit(100).get();
    const goals = snap.docs
      .map((d) => view(d.id, d.data(), today))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return NextResponse.json({ ok: true, data: { today, goals } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const CreateBody = z.object({
  title: z.string().trim().min(3).max(200),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reminders: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "goal-create", limit: 6, windowMs: 10 * 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, CreateBody);
    const today = dayIdFor();
    const dateError = validateTargetDate(body.targetDate, today);
    if (dateError) throw new ApiError(400, "VALIDATION", dateError);

    const existing = await adminDb().collection(COLLECTION).where("uid", "==", caller.uid).limit(100).get();
    if (existing.size >= 20) throw new ApiError(409, "LIMIT", "You have 20 goals already. Delete one first.");

    const daysLeft = dayDiff(today, body.targetDate) + 1;
    const weeks = Math.max(1, Math.min(12, Math.ceil(daysLeft / 7)));
    let ai = fallbackPlan(body.title);
    let usedAi = true;
    try {
      const out = await generateWithFallback({
        task: "structured_spec",
        systemInstruction: GOAL_PLAN_SYSTEM,
        userPrompt: goalPlanPrompt(body.title.replace(/<\/?USER_INPUT>/gi, ""), weeks, daysLeft),
        schema: AiPlanSchema,
        temperature: 0.4,
        userId: caller.uid,
      });
      if (out.data) ai = out.data;
      else usedAi = false;
    } catch {
      usedAi = false;
    }

    const plan = buildPlan(ai, today, body.targetDate);
    if (plan.tasks.length === 0) throw new ApiError(502, "AI_EMPTY", "Couldn't build a plan. Try rewording your goal.");

    const ref = adminDb().collection(COLLECTION).doc();
    const doc = {
      uid: caller.uid,
      title: body.title,
      targetDate: body.targetDate,
      startDate: today,
      reminders: !!body.reminders,
      milestones: plan.milestones,
      tasks: plan.tasks,
      aiGenerated: usedAi,
      createdAt: Timestamp.now(),
    };
    await ref.set(doc);
    return NextResponse.json({ ok: true, data: { goal: view(ref.id, doc, today), aiGenerated: usedAi } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const PatchBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle"), id: z.string().min(1).max(100), taskId: z.string().min(1).max(20), done: z.boolean() }),
  z.object({ action: z.literal("replan"), id: z.string().min(1).max(100) }),
  z.object({ action: z.literal("reminders"), id: z.string().min(1).max(100), enabled: z.boolean() }),
]);

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "goal-patch", limit: 120, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, PatchBody);
    const today = dayIdFor();
    const { ref, data } = await ownGoal(caller.uid, body.id);
    const tasks = (Array.isArray(data.tasks) ? data.tasks : []) as GoalTask[];

    let update: Record<string, unknown>;
    if (body.action === "toggle") {
      if (!tasks.some((t) => t.id === body.taskId)) throw new ApiError(404, "NOT_FOUND", "Task not found.");
      update = { tasks: tasks.map((t) => (t.id === body.taskId ? { ...t, done: body.done } : t)) };
    } else if (body.action === "replan") {
      update = { tasks: replan(tasks, today, String(data.targetDate)), replannedAt: Timestamp.now() };
    } else {
      update = { reminders: body.enabled };
    }
    await ref.update(update);
    return NextResponse.json({ ok: true, data: { goal: view(ref.id, { ...data, ...update }, today) } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const id = req.nextUrl.searchParams.get("id") || "";
    if (!id) throw new ApiError(400, "VALIDATION", "Missing goal id.");
    const { ref } = await ownGoal(caller.uid, id);
    await ref.delete();
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
