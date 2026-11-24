import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { institutionById } from "@/lib/academic/academic";
import { generateSecureJoinCode } from "@/lib/validation/classes";
import { writeAudit } from "@/lib/security/audit";

export const runtime = "nodejs";

const body = z.object({ institution: z.string().trim().min(2).max(120) });

/**
 * Admin: make an empty class for every course of a school that has none yet, and keep each class's department list in step
 * with its course. A course two departments share gets ONE class that lists both, so they share its lessons and library.
 * Nothing is built by AI here: the class is a shell the teacher or a class build fills in later.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const b = await parseJson(req, body);
    const inst = institutionById(b.institution);
    const instKey = inst?.id ?? b.institution.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const db = adminDb();
    const snap = await db.collection("courses").where("institutionKey", "==", instKey).limit(500).get();
    let created = 0;
    let updated = 0;
    for (const d of snap.docs) {
      const c = d.data();
      const departments = Array.isArray(c.departments) ? (c.departments as string[]) : [];
      const levels = Array.isArray(c.levels) ? (c.levels as number[]) : [];
      if (typeof c.classId === "string" && c.classId) {
        await db.collection("classes").doc(c.classId).set({ departments, levels, updatedAt: Timestamp.now() }, { merge: true });
        updated++;
        continue;
      }
      const ref = db.collection("classes").doc();
      await ref.set({
        id: ref.id,
        title: `${c.code} ${c.title || ""}`.trim(),
        subject: String(c.title || c.code),
        description: `${c.code} for ${departments.length > 1 ? "several departments" : "the department"}. Made from the course list.`,
        level: "undergrad",
        institution: inst?.name ?? b.institution,
        department: "",
        departments,
        levels,
        courseCode: c.code,
        audienceTags: [],
        durationWeeks: 14,
        teacherId: admin.uid,
        coTeacherIds: [] as string[],
        teacherName: "Sunroot",
        visibility: "public",
        status: "published",
        buildState: "empty",
        audioLessons: true,
        narratorVoice: "female",
        joinCode: generateSecureJoinCode(),
        studentCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await d.ref.set({ classId: ref.id }, { merge: true });
      created++;
    }
    await writeAudit({ actorUid: admin.uid, actorEmail: admin.email, action: "academic.course_classes", targetType: "config", targetId: instKey, details: { created, updated } });
    return NextResponse.json({ ok: true, data: { created, updated } });
  } catch (error) {
    return handleAuthError(error);
  }
}
