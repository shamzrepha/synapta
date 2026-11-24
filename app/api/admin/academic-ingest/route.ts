import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { generateWithFallback } from "@/lib/ai/router";
import { assertAiActive } from "@/lib/ai/guard";
import { institutionById, institutionByName } from "@/lib/academic/academic";
import { cleanParsed, courseId, deptKey, mergeCourse, ParsedSchema, PARSE_SYSTEM, normCode, type CourseDoc } from "@/lib/academic/courses";
import { writeAudit } from "@/lib/security/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  institution: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(100),
  level: z.number().int().min(100).max(600),
  kind: z.enum(["timetable", "outline"]),
  text: z.string().trim().min(20).max(30_000),
});

/**
 * Admin: paste a timetable or course outline for one department and level. The AI reads it once, we keep the courses and times,
 * and a course code that another department already has becomes a shared course (one class, one library for both).
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const limited = await checkRateLimit(req, { uid: admin.uid, keyPrefix: "academic-ingest", limit: 30, windowMs: 60 * 60 * 1000, shared: true });
    if (limited) return limited;
    const b = await parseJson(req, body);
    await assertAiActive({ spend: true });
    const inst = institutionById(b.institution) ?? institutionByName(b.institution);
    const instKey = inst?.id ?? deptKey(b.institution).replace(/ /g, "-");
    if (!instKey) throw new ApiError(400, "BAD_INSTITUTION", "Pick a school.");

    const out = await generateWithFallback({
      task: "structured_spec",
      systemInstruction: PARSE_SYSTEM,
      userPrompt: `Kind: ${b.kind}. Level ${b.level}.\n<USER_INPUT>\n${b.text.replace(/<\/?USER_INPUT>/gi, "")}\n</USER_INPUT>`,
      schema: ParsedSchema,
      temperature: 0,
      userId: admin.uid,
    });
    if (!out.data) throw new ApiError(502, "AI_EMPTY", "Couldn't read that. Check the text and try again.");
    const { courses, slots } = cleanParsed(out.data, b.level);
    if (courses.length === 0) throw new ApiError(422, "NOTHING_FOUND", "No course codes found in that text.");

    const db = adminDb();
    const shared: { code: string; with: string[] }[] = [];
    for (const c of courses) {
      const ref = db.collection("courses").doc(courseId(instKey, c.code));
      const cur = (await ref.get()).data() as CourseDoc | undefined;
      const { doc, sharedWith } = mergeCourse(cur ?? null, c, b.department);
      await ref.set({ ...doc, institutionKey: instKey, updatedAt: Timestamp.now() }, { merge: true });
      if (sharedWith.length) shared.push({ code: c.code, with: sharedWith });
    }
    if (b.kind === "timetable" && slots.length > 0) {
      const titles = new Map(courses.map((c) => [c.code, c.title]));
      await db.collection("timetables").doc(`${instKey}__${deptKey(b.department).replace(/ /g, "-")}__${b.level}`).set({
        institutionKey: instKey,
        department: deptKey(b.department),
        level: b.level,
        slots: slots.map((s) => ({ ...s, title: titles.get(normCode(s.code)) || "" })),
        updatedAt: Timestamp.now(),
      });
    }
    await writeAudit({ actorUid: admin.uid, actorEmail: admin.email, action: "academic.ingest", targetType: "config", targetId: instKey, details: { department: b.department, level: b.level, kind: b.kind, courses: courses.length, slots: slots.length } });
    return NextResponse.json({ ok: true, data: { courses: courses.map((c) => ({ code: c.code, title: c.title })), slots: slots.length, shared } });
  } catch (error) {
    return handleAuthError(error);
  }
}
