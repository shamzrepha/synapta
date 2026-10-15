import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { executeStructuredAiTask, AiGenerationError } from "@/lib/ai/router";
import { buildQuizPrompt, normalizeQuizQuestions, rawQuizResponseSchema, type NormalizedQuizQuestion } from "@/lib/quiz/normalize";
import { ensureQuizBank, pickForLearner, reshuffleOptions } from "@/lib/practice/bank";
import { sanitizeUntrustedPromptText } from "@/lib/ai/scrub";
import { getActiveStudentUids, getMyClassIds } from "@/lib/classes/members";
import { notifyMany } from "@/lib/notifications/server";
import { bumpChannels } from "@/lib/live/server";
import { serializeEvent, eventChannels } from "@/lib/events/store";
import { buildRulesSchema, starterFor } from "@/lib/studio/challenge";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Public challenges plus those of every class the caller belongs to. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const classIds = await getMyClassIds(caller.uid);
    const [publicSnap, ...classSnaps] = await Promise.all([
      adminDb().collection("events").where("visibility", "==", "public").orderBy("endAt", "desc").limit(40).get(),
      ...classIds.slice(0, 15).map((cid) =>
        adminDb().collection("events").where("classId", "==", cid).orderBy("endAt", "desc").limit(15).get()
      ),
    ]);
    const map = new Map<string, ReturnType<typeof serializeEvent>>();
    for (const snap of [publicSnap, ...classSnaps]) {
      for (const d of snap.docs) map.set(d.id, serializeEvent(d.id, d.data()));
    }
    const order = { live: 0, voting: 1, upcoming: 2, ended: 3 } as const;
    const events = Array.from(map.values()).sort(
      (a, b) => order[a.status] - order[b.status] || new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
    return NextResponse.json({
      ok: true,
      data: { events, channels: ["events:public", ...classIds.slice(0, 15).map((c) => `events:class:${c}`)] },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const createSchema = z.object({
  kind: z.enum(["quiz_sprint", "hackathon", "build"]),
  /** build challenges: the brief every entrant designs against */
  build: buildRulesSchema.optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000).optional().default(""),
  topic: z.string().trim().max(500).optional().default(""),
  classId: z.string().optional().nullable(),
  kcId: z.string().optional().nullable(),
  visibility: z.enum(["public", "class"]).default("class"),
  startAt: z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(60 * 24 * 14),
  votingHours: z.number().int().min(1).max(168).optional().default(24),
  questionCount: z.number().int().min(5).max(25).optional().default(10),
  secondsPerQuestion: z.number().int().min(10).max(120).optional().default(20),
  rewards: z
    .object({
      first: z.number().int().min(0).max(1000),
      second: z.number().int().min(0).max(1000),
      third: z.number().int().min(0).max(1000),
      participation: z.number().int().min(0).max(200),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "event_create", limit: 5, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);

    let classTitle: string | null = null;
    if (body.classId) {
      const access = await assertClassAccess(caller, body.classId, "mutate");
      classTitle = access.classData.title || null;
    } else if ((body.visibility ?? "class") === "class") {
      throw new ApiError(400, "VALIDATION", "Pick a class, or make the challenge public.");
    }

    const startAt = new Date(body.startAt);
    if (startAt.getTime() < Date.now() - 5 * 60 * 1000) {
      throw new ApiError(400, "VALIDATION", "Start time is in the past.");
    }
    const endAt = new Date(startAt.getTime() + body.durationMinutes * 60 * 1000);
    const host = await adminDb().collection("users").doc(caller.uid).get();
    const ref = adminDb().collection("events").doc();

    if (body.kind === "build") {
      if (!body.build) throw new ApiError(400, "VALIDATION", "Describe the build brief.");
      try {
        starterFor(buildRulesSchema.parse(body.build));
      } catch {
        throw new ApiError(400, "VALIDATION", "Pick a starting project for the challenge.");
      }
    }

    let questionCount: number | null = null;
    if (body.kind === "quiz_sprint") {
      // Prepare and verify the question set up front so the sprint starts instantly
      const count = body.questionCount ?? 10;
      let questions: NormalizedQuizQuestion[];
      if (body.classId && body.kcId) {
        // Class topic: draw from its stored question bank (no extra AI cost once the bank exists)
        const bank = await ensureQuizBank({ classId: body.classId, kcId: body.kcId, userId: caller.uid });
        questions = pickForLearner(bank, [], count).picked.map((q) => reshuffleOptions(q));
      } else {
        const contextText = sanitizeUntrustedPromptText([body.topic, body.description].filter(Boolean).join("\n\n"), 6000);
        if (!contextText.trim()) throw new ApiError(400, "VALIDATION", "Add a topic so the AI knows what to ask.");
        const prompt = buildQuizPrompt({ kcTitle: body.topic || body.title, contextText, count: Math.min(25, count + 3) });
        const result = await executeStructuredAiTask({
          task: "structured_spec",
          systemInstruction: prompt.systemInstruction,
          userPrompt: prompt.userPrompt,
          schema: rawQuizResponseSchema,
          userId: caller.uid,
          estimatedTokens: 450 * count,
        });
        questions = normalizeQuizQuestions(result.data.questions, { maxQuestions: count });
      }
      if (questions.length < 5) throw new AiGenerationError("The AI's questions didn't pass our checks. Please try again.");
      await ref.collection("private").doc("questions").set({ questions });
      questionCount = questions.length;
    }

    const doc = {
      id: ref.id,
      kind: body.kind,
      title: body.title,
      description: body.description ?? "",
      topic: body.topic ?? "",
      hostUid: caller.uid,
      hostName: host.data()?.displayName || "Teacher",
      classId: body.classId || null,
      classTitle,
      visibility: body.visibility ?? "class",
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      votingEndsAt: body.kind === "hackathon" ? Timestamp.fromDate(new Date(endAt.getTime() + (body.votingHours ?? 24) * 3600 * 1000)) : null,
      secondsPerQuestion: body.kind === "quiz_sprint" ? body.secondsPerQuestion ?? 20 : null,
      questionCount,
      rewards: body.rewards || { first: 200, second: 120, third: 80, participation: 20 },
      participantCount: 0,
      submissionCount: 0,
      build: body.kind === "build" && body.build ? buildRulesSchema.parse(body.build) : null,
      finalized: false,
      createdAt: Timestamp.now(),
    };
    await ref.set(doc);

    if (doc.classId) {
      const uids = await getActiveStudentUids(doc.classId);
      await notifyMany(uids, {
        type: "event_started",
        title: `New ${doc.kind === "hackathon" ? "hackathon" : doc.kind === "build" ? "build challenge" : "quiz sprint"}: ${doc.title}`,
        body: `Starts ${startAt.toUTCString().replace(":00 GMT", " UTC")}`,
        href: `/challenges/${ref.id}`,
        icon: doc.kind === "hackathon" ? "🛠️" : "⚡",
      });
    }
    await bumpChannels(eventChannels(ref.id, doc));
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
