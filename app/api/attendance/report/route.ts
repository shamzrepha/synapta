import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { buildReport, toCsv } from "@/lib/attendance/logic";
import { activeStudentUids, displayNames } from "@/lib/teach/roster";

export const runtime = "nodejs";

/** Per-student attendance for a class. `?format=csv` downloads a CSV. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const url = new URL(req.url);
    const classId = url.searchParams.get("classId");
    if (!classId) throw new ApiError(400, "VALIDATION", "classId is required");
    const access = await assertClassAccess(caller, classId, "mutate");

    const [sessSnap, checkSnap, uids] = await Promise.all([
      adminDb().collection("attendanceSessions").where("classId", "==", classId).limit(200).get(),
      adminDb().collection("attendanceCheckins").where("classId", "==", classId).limit(5000).get(),
      activeStudentUids(classId, access.classData),
    ]);
    const report = buildReport(
      sessSnap.docs.map((d) => d.id),
      checkSnap.docs.map((d) => d.data() as { sessionId: string; uid: string; late: boolean }),
      uids
    );
    const names = await displayNames(uids);
    const rows = report
      .map((r) => ({ ...r, name: names.get(r.uid) || "Student" }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (url.searchParams.get("format") === "csv") {
      return new NextResponse(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="attendance-${classId}.csv"`,
        },
      });
    }
    return NextResponse.json({ ok: true, data: { totalSessions: sessSnap.size, students: rows } });
  } catch (error) {
    return handleAuthError(error);
  }
}
