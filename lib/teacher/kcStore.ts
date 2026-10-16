import { draftMap } from "@/lib/classes/published";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { KnowledgeComponent } from "@/lib/types/course";
import { safeBktParams } from "@/lib/bkt/engine";
import { slugify } from "@/lib/teacher/classBuilder";
import { kcSchema } from "@/lib/validation/course";

/**
 * Creates a new Knowledge Component under classes/{classId}/kcs.
 */
export type KcInput = Partial<Omit<KnowledgeComponent, "bkt">> & {
  title: string;
  description: string;
  bkt?: Partial<KnowledgeComponent["bkt"]>;
};

/**
 * Creates a new Knowledge Component under classes/{classId}/kcs.
 */
export async function createKc(
  classId: string,
  raw: KcInput
): Promise<KnowledgeComponent> {
  const parsed = kcSchema.parse({
    ...raw,
    objectives: raw.objectives && raw.objectives.length > 0 ? raw.objectives : ["Understand core concepts"],
  });

  const slug = raw.slug || slugify(parsed.title);
  const kcsCol = adminDb().collection("classes").doc(classId).collection("kcs");
  const docRef = raw.id ? kcsCol.doc(raw.id) : kcsCol.doc();

  const bkt = safeBktParams(parsed.bkt);

  const kc: KnowledgeComponent = {
    id: docRef.id,
    classId,
    title: parsed.title,
    slug,
    description: parsed.description,
    week: parsed.week || 1,
    objectives: parsed.objectives,
    prerequisiteIds: parsed.prerequisiteIds || [],
    bkt,
    difficulty: parsed.difficulty,
    status: parsed.status,
    sourceMaterialIds: parsed.sourceMaterialIds || [],
    contentPublished: draftMap(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await docRef.set(kc);
  return kc;
}

/**
 * Updates an existing Knowledge Component under classes/{classId}/kcs/{kcId}.
 */
export async function updateKc(
  classId: string,
  kcId: string,
  updates: Partial<Omit<KnowledgeComponent, "bkt">> & { bkt?: Partial<KnowledgeComponent["bkt"]> }
): Promise<void> {
  const kcRef = adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);
  const cleanUpdates: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };

  if (updates.bkt) {
    cleanUpdates.bkt = safeBktParams(updates.bkt);
  }

  await kcRef.update(cleanUpdates);
}

/**
 * Idempotently upserts an AI-generated Knowledge Component.
 * Deduplicates by slug or exact title, preventing duplicate nodes while preserving existing IDs.
 */
export async function upsertAiKc(
  classId: string,
  kcData: {
    title: string;
    description: string;
    slug?: string;
    week?: number;
    objectives?: string[];
    prerequisiteIds?: string[];
    bkt?: Partial<KnowledgeComponent["bkt"]>;
    difficulty?: "introductory" | "intermediate" | "advanced";
  }
): Promise<KnowledgeComponent> {
  const targetSlug = kcData.slug || slugify(kcData.title);
  const kcsCol = adminDb().collection("classes").doc(classId).collection("kcs");

  // Check if KC already exists by slug
  const bySlug = await kcsCol.where("slug", "==", targetSlug).limit(1).get();
  let existingDoc = bySlug.empty ? null : bySlug.docs[0];

  // Fallback: check by title if slug query returned empty
  if (!existingDoc) {
    const byTitle = await kcsCol.where("title", "==", kcData.title).limit(1).get();
    if (!byTitle.empty) {
      existingDoc = byTitle.docs[0];
    }
  }

  if (existingDoc) {
    const existing = existingDoc.data() as KnowledgeComponent;
    const mergedBkt = safeBktParams(kcData.bkt || existing.bkt);

    await existingDoc.ref.update({
      description: kcData.description || existing.description,
      objectives: kcData.objectives && kcData.objectives.length > 0 ? kcData.objectives : existing.objectives,
      bkt: mergedBkt,
      updatedAt: Timestamp.now(),
    });

    return {
      ...existing,
      id: existingDoc.id,
      description: kcData.description || existing.description,
      bkt: mergedBkt,
    };
  }

  // Not found: create new
  return createKc(classId, {
    ...kcData,
    slug: targetSlug,
    objectives: kcData.objectives || ["Master core concepts"],
  });
}
