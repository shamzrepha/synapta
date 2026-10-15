import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { notifyMany } from "@/lib/notifications/server";
import { activeStudentUids, classTitles, isTeacherRole, studentClassIds, teacherClassIds } from "@/lib/teach/roster";
import { cleanText, sortAnnouncements } from "@/lib/announcements/logic";

export const runtime = "nodejs";

/**
 * Announcements across the caller's classes (students: enrolled classes; teachers: classes they teach).
 * Each item carries `read` for the caller. Optional ?classId= narrows it.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const classFilter = new URL(req.url).searchParams.get("classId");
    const teacher = isTeacherRole(caller.role);
    let classIds = teacher ? await teacherClassIds(caller.uid) : await studentClassIds(caller.uid);
    // Teachers who are also enrolled elsewhere as students see those too.
    if (teacher) classIds = Array.from(new Set([...classIds, ...(await studentClassIds(caller.uid))]));
    if (classFilter) classIds = classIds.filter((c) => c === classFilter);
    classIds = classIds.slice(0, 40);
    if (classIds.length === 0) return NextResponse.json({ ok: true, data: { items: [], unread: 0, classes: [] } });

    const chunks: string[][] = [];
    for (let i = 0; i < classIds.length; i += 10) chunks.push(classIds.slice(i, i + 10));
    const [annSnaps, readSnap, titles] = await Promise.all([
      Promise.all(chunks.map((c) => adminDb().collection("classAnnouncements").where("classId", "in", c).limit(100).get())),
      adminDb().collection("announcementReads").where("uid", "==", caller.uid).limit(1000).get(),
      classTitles(classIds),
    ]);
    const readIds = new Set(readSnap.docs.map((d) => d.data().announcementId as string));
    const mineClasses = new Set(teacher ? await teacherClassIds(caller.uid) : []);
    const items = sortAnnouncements(
      annSnaps.flatMap((s) =>
        s.docs.map((d) => {
          const a = d.data();
          return {
            id: a.id as string,
            classId: a.classId as string,
            classTitle: titles.get(a.classId) || "Class",
            title: a.title as string,
            body: a.body as string,
            pinned: !!a.pinned,
            authorId: a.authorId as string,
            authorName: a.authorName as string,
            createdAt: a.createdAt as string,
            updatedAt: (a.updatedAt as string) || (a.createdAt as string),
            read: readIds.has(a.id) || a.authorId === caller.uid,
            canManage: a.authorId === caller.uid || caller.role === "admin",
            canSeeReceipts: mineClasses.has(a.classId) || caller.role === "admin",
          };
        })
      )
    );
    const unread = items.filter((i) => !i.read).length;
    const classes = classIds.map((id) => ({ id, title: titles.get(id) || "Class", canPost: mineClasses.has(id) }));
    return NextResponse.json({ ok: true, data: { items, unread, classes } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const Create = z.object({
  classId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(5000),
  pinned: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "announce-post", limit: 20, windowMs: 60 * 60 * 1000 });
    if (limited) return limited;
    const body = await parseJson(req, Create);
    const access = await assertClassAccess(caller, body.classId, "mutate");

    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    const authorName = (userDoc.data()?.displayName as string) || String(access.classData.teacherName || "Teacher");
    const ref = adminDb().collection("classAnnouncements").doc();
    const now = new Date().toISOString();
    const announcement = {
      id: ref.id,
      classId: body.classId,
      authorId: caller.uid,
      authorName,
      title: cleanText(body.title, 140),
      body: cleanText(body.body, 5000),
      pinned: !!body.pinned,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(announcement);

    const uids = await activeStudentUids(body.classId, access.classData);
    await notifyMany(uids, {
      type: "system",
      title: `${access.classData.title || "Class"}: ${announcement.title}`,
      body: announcement.body.slice(0, 140),
      href: "/classes/announcements",
      icon: "📣",
      actorUid: caller.uid,
      actorName: authorName,
    });
    return NextResponse.json({ ok: true, data: announcement });
  } catch (error) {
    return handleAuthError(error);
  }
}
