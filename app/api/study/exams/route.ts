import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { getMyClassIds } from "@/lib/classes/members";
import { buildSchedule, daysBetween, isDayString, type ExamTopic } from "@/lib/exams/schedule";
import { assertPlausibleToday } from "@/lib/exams/server";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  examDate: z.string().refine(isDayString, "examDate must be YYYY-MM-DD"),
  today: z.string().refine(isDayString, "today must be YYYY-MM-DD"),
  minutesPerDay: z.number().int().min(15).max(480),
  topics: z.array(z.string().trim().min(1).max(80)).max(25).default([]),
  classIds: z.array(z.string().min(1).max(60)).max(5).default([]),
});

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("examPlans").where("uid", "==", caller.uid).limit(50).get();
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String((a as { examDate?: string }).examDate).localeCompare(String((b as { examDate?: string }).examDate)));
    return NextResponse.json({ ok: true, data: { items } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "exam-create", limit: 20, windowMs: 60 * 60 * 1000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);
    assertPlausibleToday(body.today);
    if (daysBetween(body.today, body.examDate) < 1) throw new ApiError(400, "BAD_DATE", "Pick an exam date after today.");
    if (daysBetween(body.today, body.examDate) > 365) throw new ApiError(400, "BAD_DATE", "Exam date is more than a year away.");

    const existing = await adminDb().collection("examPlans").where("uid", "==", caller.uid).limit(50).get();
    if (existing.size >= 20) throw new ApiError(409, "LIMIT", "You can keep up to 20 exam plans. Delete an old one first.");

    // Topics: typed ones + every topic of the chosen classes, with stored mastery where it exists
    const topics: ExamTopic[] = [];
    const mine = (body.classIds ?? []).length ? new Set(await getMyClassIds(caller.uid)) : new Set<string>();
    const classIds = (body.classIds ?? []).filter((c) => mine.has(c));
    const kcTitles: Array<{ title: string; kcId: string }> = [];
    for (const classId of classIds) {
      const kcs = await adminDb().collection("classes").doc(classId).collection("kcs").limit(40).get();
      for (const k of kcs.docs) {
        const title = String(k.data().title || "").trim();
        if (title) kcTitles.push({ title, kcId: k.id });
      }
    }
    const pl = new Map<string, number>();
    if (kcTitles.length) {
      const docs = await adminDb().getAll(...kcTitles.map((k) => adminDb().collection("mastery").doc(`${caller.uid}_${k.kcId}`)));
      docs.forEach((d, i) => {
        if (d.exists && typeof d.data()?.pL === "number") pl.set(kcTitles[i].title.toLowerCase(), d.data()!.pL);
      });
    }
    const add = (name: string) => {
      if (topics.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
      topics.push({ name, mastery: pl.get(name.toLowerCase()) ?? null });
    };
    (body.topics ?? []).forEach(add);
    kcTitles.forEach((k) => add(k.title));
    const finalTopics = topics.slice(0, 40);
    if (finalTopics.length === 0) throw new ApiError(400, "NO_TOPICS", "Add at least one topic or pick a class.");

    const plan = buildSchedule({ today: body.today, examDate: body.examDate, topics: finalTopics, minutesPerDay: body.minutesPerDay });
    const ref = adminDb().collection("examPlans").doc();
    const now = new Date().toISOString();
    const doc = {
      uid: caller.uid,
      name: body.name,
      examDate: body.examDate,
      minutesPerDay: body.minutesPerDay,
      topics: finalTopics,
      classIds,
      plan,
      done: {} as Record<string, boolean>,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(doc);
    return NextResponse.json({ ok: true, data: { id: ref.id, ...doc } });
  } catch (error) {
    return handleAuthError(error);
  }
}
