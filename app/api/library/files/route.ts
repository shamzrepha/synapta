import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { readAcademic } from "@/lib/academic/server";
import { readRep, studentCanSee } from "@/lib/library/access";
import { FILES, deptKey, publicFile } from "@/lib/library/server";

export const runtime = "nodejs";

/** The library as this person may see it: a student, their department up to their level; a rep, their department; an admin, everything. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const user = (await adminDb().collection("users").doc(caller.uid).get()).data() || {};
    const rep = readRep(user);
    let docs: Array<Record<string, unknown>> = [];
    let mode: "student" | "rep" | "admin" = "student";
    if (caller.role === "admin") {
      mode = "admin";
      docs = (await FILES().limit(300).get()).docs.map((d) => d.data());
    } else {
      const academic = readAcademic(user);
      const dept = rep?.department ?? academic?.department ?? "";
      if (dept) {
        const all = (await FILES().where("deptKey", "==", deptKey(dept)).limit(300).get()).docs.map((d) => d.data());
        if (rep) {
          mode = "rep";
          docs = all;
        } else {
          docs = all.filter((d) => studentCanSee(academic, d as { institutionId?: string | null; institution?: string; department?: string; level?: number | null }));
        }
      }
    }
    const files = docs.map(publicFile).sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.title.localeCompare(b.title));
    return NextResponse.json({ ok: true, data: { mode, files, rep: rep ? { institution: rep.institution, department: rep.department } : null } });
  } catch (error) {
    return handleAuthError(error);
  }
}
