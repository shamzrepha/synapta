import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { getClassAccess } from "@/lib/auth/classAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { createDesign, serializeDesign } from "@/lib/studio/store";
import { getTemplate, templateStart } from "@/lib/studio/templates";
import { emptySpec, designKinds } from "@/lib/studio/spec";
import { generateDesign } from "@/lib/studio/design-ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Lists designs: mine (owned or shared with me), public (newest or top), a class's, or a challenge's entries. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const sp = req.nextUrl.searchParams;
    const scope = sp.get("scope") || "mine";
    const col = adminDb().collection("designs");
    let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    if (scope === "mine") {
      docs = (await col.where("memberIds", "array-contains", caller.uid).orderBy("updatedAt", "desc").limit(60).get()).docs;
    } else if (scope === "public") {
      const order = sp.get("sort") === "top" ? "starCount" : "updatedAt";
      docs = (await col.where("visibility", "==", "public").orderBy(order, "desc").limit(60).get()).docs;
    } else if (scope === "class") {
      const classId = sp.get("classId") || "";
      if (!classId || !(await getClassAccess(caller, classId)).canView) throw new ApiError(403, "FORBIDDEN", "Join the class to see its designs.");
      docs = (await col.where("classId", "==", classId).orderBy("updatedAt", "desc").limit(100).get()).docs.filter((d) => d.data().visibility !== "private" || (d.data().memberIds || []).includes(caller.uid));
    } else if (scope === "challenge") {
      docs = (await col.where("challengeId", "==", sp.get("challengeId") || "-").limit(200).get()).docs.filter((d) => d.data().visibility !== "private" || (d.data().memberIds || []).includes(caller.uid));
    }
    const kind = sp.get("kind");
    const q = (sp.get("q") || "").toLowerCase();
    const items = docs
      .map((d) => serializeDesign(d.id, d.data()))
      .filter((d) => (!kind || d.kind === kind) && (!q || `${d.title} ${d.summary}`.toLowerCase().includes(q)));
    return NextResponse.json({ ok: true, data: { designs: items } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const createSchema = z.object({
  from: z.enum(["template", "blank", "prompt"]),
  templateId: z.string().max(60).optional(),
  /** template: start from the guided starter (true) or the finished build (false) */
  guided: z.boolean().default(true),
  kind: z.enum(designKinds).optional(),
  prompt: z.string().trim().max(1500).optional(),
  level: z.string().max(20).optional(),
  title: z.string().trim().max(80).optional(),
  visibility: z.enum(["private", "public", "class"]).default("private"),
  classId: z.string().max(80).nullish(),
  kcId: z.string().max(80).nullish(),
  challengeId: z.string().max(80).nullish(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await parseJson(req, createSchema);
    if (body.classId && !(await getClassAccess(caller, body.classId)).canView) throw new ApiError(403, "FORBIDDEN", "Join the class first.");
    let id: string;
    if (body.from === "template") {
      const t = getTemplate(body.templateId || "");
      if (!t) throw new ApiError(404, "NOT_FOUND", "Template not found");
      id = await createDesign({ user: caller, title: body.title || t.title, spec: templateStart(t, body.guided), source: "template", message: `Started from “${t.title}”`, templateId: t.id, visibility: body.visibility, classId: body.classId, kcId: body.kcId, challengeId: body.challengeId });
    } else if (body.from === "prompt") {
      if (!body.prompt || body.prompt.length < 4) throw new ApiError(400, "VALIDATION", "Describe what you want to build.");
      const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_ai", limit: 8, windowMs: 60_000 });
      if (limited) return limited;
      const out = await generateDesign({ prompt: body.prompt, kind: body.kind, level: body.level, userId: caller.uid });
      id = await createDesign({ user: caller, title: body.title || out.title, spec: out.spec, source: "ai", message: out.message || `AI: ${body.prompt.slice(0, 80)}`, visibility: body.visibility, classId: body.classId, kcId: body.kcId, challengeId: body.challengeId });
    } else {
      const kind = body.kind || "circuit";
      id = await createDesign({ user: caller, title: body.title || `New ${kind}`, spec: emptySpec(kind), source: "create", message: "Created design", visibility: body.visibility, classId: body.classId, kcId: body.kcId, challengeId: body.challengeId });
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
