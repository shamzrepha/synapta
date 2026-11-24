import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { readAcademic } from "@/lib/academic/server";
import { levelNow } from "@/lib/academic/academic";
import { deptKey } from "@/lib/academic/courses";

export const runtime = "nodejs";

/** The signed-in student's own timetable and courses, from their locked department and level. Nobody else's. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const userSnap = await adminDb().collection("users").doc(caller.uid).get();
    const a = readAcademic(userSnap.data());
    if (!a) return NextResponse.json({ ok: true, data: { set: false, slots: [], courses: [] } });
    const instKey = a.institutionId ?? deptKey(a.institution).replace(/ /g, "-");
    const level = levelNow(a);
    const dept = deptKey(a.department);
    const [tt, cs] = await Promise.all([
      adminDb().collection("timetables").doc(`${instKey}__${dept.replace(/ /g, "-")}__${level}`).get(),
      adminDb().collection("courses").where("departments", "array-contains", dept).limit(200).get(),
    ]);
    const courses = cs.docs
      .map((d) => d.data())
      .filter((c) => c.institutionKey === instKey && Array.isArray(c.levels) && c.levels.includes(level))
      .map((c) => ({ code: String(c.code), title: String(c.title || ""), shared: Array.isArray(c.departments) && c.departments.length > 1 }));
    return NextResponse.json({ ok: true, data: { set: true, level, department: a.department, slots: tt.data()?.slots ?? [], courses } });
  } catch (error) {
    return handleAuthError(error);
  }
}
