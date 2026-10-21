import { z } from "zod";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/requireUser";
import { createDesign } from "./store";
import { getTemplate, templateStart } from "./templates";
import { parseSpec, type DesignSpec } from "./spec";
import { proofSpec } from "./proof";

/**
 * Class topic labs: a topic is broken into small build "worlds" (subtopic labs). Each lab points
 * at a pre-saved template or a teacher's design; a student starts their own copy and works
 * through its guided steps, and the teacher sees everyone's progress.
 */
export const labSchema = z.object({
  id: z.string(),
  title: z.string().max(100),
  goal: z.string().max(500).default(""),
  templateId: z.string().nullable().default(null),
  designId: z.string().nullable().default(null),
  /** the frozen copy of `designId` students start from; updated when the teacher pushes, so edits stay private until then */
  liveDesignId: z.string().nullable().default(null),
  kind: z.enum(["circuit", "mechanism", "assembly"]),
  stepCount: z.number().int().default(0),
  dueAt: z.string().nullable().default(null),
  /** a lab the teacher is still preparing is hidden from students; labs saved before this flag count as published */
  published: z.boolean().default(true),
  createdAt: z.string(),
});
export type Lab = z.output<typeof labSchema>;

export function kcRef(classId: string, kcId: string) {
  return adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);
}

export async function readLabs(classId: string, kcId: string): Promise<Lab[]> {
  const snap = await kcRef(classId, kcId).get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found");
  const raw = Array.isArray(snap.data()!.labs) ? snap.data()!.labs : [];
  return raw.map((l: unknown) => labSchema.safeParse(l)).filter((r: { success: boolean }) => r.success).map((r: { data?: Lab }) => r.data!);
}

/** The teacher's version of a lab (the pushed snapshot when there is one). Never shown to a learner doing "Prove it". */
async function labReference(lab: Lab): Promise<{ spec: DesignSpec; forkedFrom: { id: string; title: string; ownerName: string; commitId: string } | null }> {
  if (lab.designId) {
    const src = await adminDb().collection("designs").doc(lab.liveDesignId || lab.designId).get();
    if (!src.exists) throw new ApiError(404, "NOT_FOUND", "This lab's design was removed by the teacher.");
    return {
      spec: parseSpec(src.data()!.spec),
      forkedFrom: { id: lab.designId, title: String(src.data()!.title), ownerName: String(src.data()!.ownerName), commitId: String(src.data()!.headCommitId) },
    };
  }
  const t = getTemplate(lab.templateId || "");
  if (!t) throw new ApiError(404, "NOT_FOUND", "Lab template not found");
  return { spec: templateStart(t, true), forkedFrom: null };
}

/** Marks a design as the "rebuild it yourself" copy of a lab, so it never collides with the guided copy. */
export const proofLabKey = (classId: string, kcId: string, labId: string) => `${classId}/${kcId}/${labId}~proof`;

/**
 * The caller's own copy of a lab, creating it on first start. With `proof`, the copy starts from an empty bench and the
 * learner has to buy, place, wire and program everything themselves.
 */
export async function startLab(user: AuthUser, classId: string, kcId: string, lab: Lab, opts: { proof?: boolean } = {}): Promise<string> {
  const db = adminDb();
  const labKey = opts.proof ? proofLabKey(classId, kcId, lab.id) : `${classId}/${kcId}/${lab.id}`;
  const existing = await db.collection("designs").where("ownerUid", "==", user.uid).where("labId", "==", labKey).limit(1).get();
  if (!existing.empty) return existing.docs[0].id;
  const ref = await labReference(lab);
  let spec = ref.spec;
  if (opts.proof) {
    const empty = proofSpec(spec);
    if (!empty) throw new ApiError(409, "PROOF_UNAVAILABLE", "This build can't be rebuilt from scratch yet. Use Build & test for it.");
    spec = empty;
  }
  return createDesign({
    user,
    title: opts.proof ? `Prove it: ${lab.title}` : lab.title,
    spec,
    source: opts.proof ? "template" : lab.designId ? "fork" : "template",
    message: opts.proof ? `Started “${lab.title}” from an empty bench` : `Started lab “${lab.title}”`,
    visibility: "class",
    classId,
    kcId,
    templateId: opts.proof ? null : lab.templateId,
    // the learner's rebuild never points back at the teacher's design
    forkedFrom: opts.proof ? null : ref.forkedFrom,
    labId: labKey,
  });
}

/** On push, freezes the teacher's design as the copy students start from. Template labs are already fixed. */
export async function snapshotLabDesign(user: AuthUser, classId: string, kcId: string, lab: Lab): Promise<{ liveDesignId?: string | null }> {
  if (!lab.designId) return {};
  const src = await adminDb().collection("designs").doc(lab.designId).get();
  if (!src.exists) return {};
  const liveDesignId = await createDesign({
    user,
    title: lab.title,
    spec: parseSpec(src.data()!.spec),
    source: "fork",
    message: `Pushed to students: “${lab.title}”`,
    visibility: "class",
    classId,
    kcId,
    templateId: null,
    forkedFrom: null,
  });
  return { liveDesignId };
}

export function newLabId(): string {
  return `lab_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function nowIso(): string {
  return Timestamp.now().toDate().toISOString();
}
