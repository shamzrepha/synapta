import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { buildReport } from "@/lib/attendance/logic";
import { classTitles, studentClassIds } from "@/lib/teach/roster";

export const runtime = "nodejs";

/** The signed-in student's own attendance per class. Never includes check-in codes or other students. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const classIds = (await studentClassIds(caller.uid)).slice(0, 30);
    if (classIds.length === 0) return NextResponse.json({ ok: true, data: [] });

    const [mineSnap, titles, ...sessionSnaps] = await Promise.all([
      adminDb().collection("attendanceCheckins").where("uid", "==", caller.uid).limit(2000).get(),
      classTitles(classIds),
      ...classIds.map((c) => adminDb().collection("attendanceSessions").where("classId", "==", c).limit(200).get()),
    ]);
    const mine = mineSnap.docs.map((d) => d.data() as { sessionId: string; classId: string; uid: string; late: boolean; at: number });

    const data = classIds.map((classId, i) => {
      const sessions = sessionSnaps[i].docs
        .map((d) => d.data() as { id: string; openedAt: number; title?: string })
        .sort((a, b) => b.openedAt - a.openedAt);
      const r = buildReport(sessions.map((s) => s.id), mine, [caller.uid])[0];
      const byS = new Map(mine.filter((m) => m.classId === classId).map((m) => [m.sessionId, m]));
      return {
        classId,
        classTitle: titles.get(classId) || "Class",
        present: r.present,
        late: r.late,
        total: r.total,
        percent: r.percent,
        sessions: sessions.slice(0, 30).map((s) => ({
          id: s.id,
          openedAt: s.openedAt,
          title: s.title || "",
          attended: byS.has(s.id),
          late: !!byS.get(s.id)?.late,
        })),
      };
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return handleAuthError(error);
  }
}
