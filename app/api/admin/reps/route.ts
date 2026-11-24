import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminAuth, adminDb, Timestamp, FieldValue } from "@/lib/firebase/admin";
import { checkAcademic } from "@/lib/academic/academic";
import { readRep } from "@/lib/library/access";
import { notify } from "@/lib/notifications/server";
import { writeAudit } from "@/lib/security/audit";

export const runtime = "nodejs";

/** Finds a user by id or email, with just enough to be sure it is the right person. */
async function find(q: string) {
  const s = q.trim();
  if (!s) return null;
  let uid = s;
  if (s.includes("@")) {
    try {
      uid = (await adminAuth().getUserByEmail(s)).uid;
    } catch {
      return null;
    }
  }
  const snap = await adminDb().collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const u = snap.data() || {};
  return { uid, name: String(u.displayName || u.username || ""), email: String(u.email || ""), institution: String(u.institution || ""), department: String(u.department || ""), rep: readRep(u) };
}

/** Admin: list the course reps, or look one person up (`?lookup=<user id or email>`) before making them one. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const lookup = new URL(req.url).searchParams.get("lookup");
    if (lookup) return NextResponse.json({ ok: true, data: { user: await find(lookup) } });
    const snap = await adminDb().collection("users").where("courseRep.department", ">", "").limit(200).get();
    const reps = snap.docs.map((d) => {
      const u = d.data();
      return { uid: d.id, name: String(u.displayName || u.username || ""), email: String(u.email || ""), rep: readRep(u) };
    });
    return NextResponse.json({ ok: true, data: { reps } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), uid: z.string().trim().min(1).max(128), institutionId: z.string().nullable().optional(), institution: z.string().trim().max(100).optional(), school: z.string().trim().max(120).optional(), department: z.string().trim().min(2).max(100) }),
  z.object({ action: z.literal("revoke"), uid: z.string().trim().min(1).max(128) }),
]);

export async function POST(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const b = await parseJson(req, body);
    const userRef = adminDb().collection("users").doc(b.uid);
    if (!(await userRef.get()).exists) throw new ApiError(404, "NOT_FOUND", "No user with that id.");
    if (b.action === "revoke") {
      await userRef.update({ courseRep: FieldValue.delete() });
      await writeAudit({ actorUid: admin.uid, actorEmail: admin.email, action: "course_rep.revoke", targetType: "user", targetId: b.uid, details: {} });
      return NextResponse.json({ ok: true, data: { revoked: true } });
    }
    // the department must be a real choice for a school in our list; another school may be typed
    const c = checkAcademic({ institutionId: b.institutionId ?? null, institution: b.institution ?? "", school: b.school, department: b.department, level: 100 });
    if (!c.ok) throw new ApiError(400, "BAD_DEPARTMENT", c.message);
    const scope = { institutionId: c.value.institutionId, institution: c.value.institution, department: c.value.department, grantedBy: admin.uid, grantedAt: Timestamp.now() };
    await userRef.set({ courseRep: scope }, { merge: true });
    await writeAudit({ actorUid: admin.uid, actorEmail: admin.email, action: "course_rep.grant", targetType: "user", targetId: b.uid, details: { institution: scope.institution, department: scope.department } });
    await notify(b.uid, { type: "system", title: "You're a course rep", body: `You can now add materials for ${scope.department}. Open Library.`, href: "/study/library" });
    return NextResponse.json({ ok: true, data: { rep: { institutionId: scope.institutionId, institution: scope.institution, department: scope.department } } });
  } catch (error) {
    return handleAuthError(error);
  }
}
