import { executeStructuredAiTask } from "@/lib/ai/router";
import { sanitizeUntrustedPromptText } from "@/lib/ai/scrub";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { slugify, deriveBktPriors } from "@/lib/teacher/classBuilder";
import { ApiError } from "@/lib/api/errors";
import { z } from "zod";

export interface MapOperation {
  id: string;
  type: "add_kc" | "merge_into" | "attach_material" | "add_prereq" | "split_kc";
  targetKcId?: string;
  mergeTargetKcId?: string;
  newKcData?: {
    title: string;
    description: string;
    objectives: string[];
    prerequisiteIds: string[];
    week?: number;
  };
  rationale: string;
  confidence: number;
  sourceSnippet?: string;
}

export interface MapProposal {
  id: string;
  classId: string;
  materialId: string;
  status: "pending" | "applied" | "dismissed";
  operations: MapOperation[];
  createdAt: unknown;
}

const mapDecisionsSchema = z.object({
  operations: z.array(
    z.object({
      type: z.enum(["add_kc", "merge_into", "attach_material", "add_prereq", "split_kc"]),
      targetKcId: z.string().optional(),
      mergeTargetKcId: z.string().optional(),
      newKcTitle: z.string().optional(),
      newKcDescription: z.string().optional(),
      newKcObjectives: z.array(z.string()).optional(),
      newKcPrerequisiteTitles: z.array(z.string()).optional(),
      rationale: z.string(),
      confidence: z.number().min(0).max(1),
      sourceSnippet: z.string().optional(),
    })
  ),
});

/**
 * Analyzes an uploaded document against the classroom's existing concept map
 * and routes topics to either attach, merge, or create new KCs.
 */
export async function analyzeMaterialAndRoute({
  classId,
  materialId,
  materialTitle,
  extractedText,
  userId,
}: {
  classId: string;
  materialId: string;
  materialTitle: string;
  extractedText: string;
  userId?: string;
}): Promise<MapProposal> {
  const cleanContent = sanitizeUntrustedPromptText(extractedText, 15000);

  // 1. Fetch current classroom KCs
  const kcsSnap = await adminDb()
    .collection("classes")
    .doc(classId)
    .collection("kcs")
    .orderBy("order", "asc")
    .get();

  const currentKcs = kcsSnap.docs.map((d) => ({
    id: d.id,
    title: (d.data().title as string) || "",
    description: (d.data().description as string) || "",
    order: (d.data().order as number) || 1,
  }));

  const systemInstruction = `You are Sunroot's AI Curriculum Router.
Compare new uploaded learning material against the course's current Knowledge Component (KC) map.

Decision Options:
- attach_material: Content directly explains or provides examples for an existing KC. Specify targetKcId.
- merge_into: Content introduces a topic that is a near-duplicate of an existing KC. Propose merging targetKcId into mergeTargetKcId.
- add_kc: Content presents a genuinely new topic not covered by current KCs. Propose title, description, objectives, and prerequisites.
- add_prereq: Material proves that an existing KC needs an additional prerequisite.

Provide a confidence score (0.0 to 1.0) and clear rationale for each operation.`;

  const userPrompt = `Material Title: ${materialTitle}
Current Course KCs:
${JSON.stringify(currentKcs, null, 2)}

Uploaded Document Content (sanitized):
<MATERIAL>
${cleanContent}
</MATERIAL>`;

  const aiResult = await executeStructuredAiTask({
    task: "structured_spec",
    systemInstruction,
    userPrompt,
    schema: mapDecisionsSchema,
    userId,
    estimatedTokens: 3000,
    isPrivileged: true,
  });

  const titleToIdMap = new Map<string, string>();
  currentKcs.forEach((k) => titleToIdMap.set(k.title.toLowerCase().trim(), k.id));

  const operations: MapOperation[] = aiResult.data.operations.map((op, idx) => {
    let resolvedPrereqIds: string[] = [];
    if (op.newKcPrerequisiteTitles) {
      resolvedPrereqIds = op.newKcPrerequisiteTitles
        .map((t) => titleToIdMap.get(t.toLowerCase().trim()))
        .filter((id): id is string => Boolean(id));
    }

    return {
      id: `op_${idx + 1}_${Date.now()}`,
      type: op.type,
      targetKcId: op.targetKcId,
      mergeTargetKcId: op.mergeTargetKcId,
      newKcData:
        op.type === "add_kc" && op.newKcTitle
          ? {
              title: op.newKcTitle,
              description: op.newKcDescription || "",
              objectives: op.newKcObjectives || [`[Understand] ${op.newKcTitle}`],
              prerequisiteIds: resolvedPrereqIds,
              week: currentKcs.length > 0 ? Math.ceil((currentKcs.length + 1) / 3) : 1,
            }
          : undefined,
      rationale: op.rationale,
      confidence: op.confidence,
      sourceSnippet: op.sourceSnippet,
    };
  });

  const proposalId = `prop_${materialId}_${Date.now()}`;
  const proposalRef = adminDb()
    .collection("classes")
    .doc(classId)
    .collection("mapProposals")
    .doc(proposalId);

  const proposal: MapProposal = {
    id: proposalId,
    classId,
    materialId,
    status: "pending",
    operations,
    createdAt: Timestamp.now(),
  };

  await proposalRef.set(proposal);

  return proposal;
}

/**
 * Applies approved operations from a MapProposal to the live course concept map,
 * saving an undo snapshot before mutating.
 */
export async function applyMapProposal({
  classId,
  proposalId,
  operationIds,
}: {
  classId: string;
  proposalId: string;
  operationIds?: string[];
}): Promise<{ appliedCount: number }> {
  const proposalRef = adminDb()
    .collection("classes")
    .doc(classId)
    .collection("mapProposals")
    .doc(proposalId);

  const pDoc = await proposalRef.get();
  if (!pDoc.exists) {
    throw new ApiError(404, "NOT_FOUND", "Proposal not found");
  }

  const proposalData = pDoc.data() as MapProposal;
  const opsToApply = operationIds
    ? proposalData.operations.filter((op) => operationIds.includes(op.id))
    : proposalData.operations;

  if (opsToApply.length === 0) {
    return { appliedCount: 0 };
  }

  // 1. Snapshot current KCs for rollback
  const kcsCollection = adminDb().collection("classes").doc(classId).collection("kcs");
  const currentKcsSnap = await kcsCollection.get();
  const snapshotKcs = currentKcsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const snapshotRef = adminDb()
    .collection("classes")
    .doc(classId)
    .collection("mapVersions")
    .doc(`snapshot_${Date.now()}`);

  await snapshotRef.set({
    createdAt: Timestamp.now(),
    proposalId,
    kcs: snapshotKcs,
  });

  // 2. Apply operations in a batch
  const batch = adminDb().batch();
  let appliedCount = 0;

  for (const op of opsToApply) {
    if (op.type === "attach_material" && op.targetKcId) {
      const kcRef = kcsCollection.doc(op.targetKcId);
      const kcDoc = await kcRef.get();
      if (kcDoc.exists) {
        const existingMaterials = (kcDoc.data()?.sourceMaterialIds as string[]) || [];
        if (!existingMaterials.includes(proposalData.materialId)) {
          batch.update(kcRef, {
            sourceMaterialIds: [...existingMaterials, proposalData.materialId],
            contentVersion: ((kcDoc.data()?.contentVersion as number) || 1) + 1,
            updatedAt: Timestamp.now(),
          });
          appliedCount++;
        }
      }
    } else if (op.type === "add_kc" && op.newKcData) {
      const slug = `${String(currentKcsSnap.size + appliedCount + 1).padStart(2, "0")}-${slugify(op.newKcData.title)}`;
      const kcRef = kcsCollection.doc(slug);
      batch.set(kcRef, {
        id: slug,
        title: op.newKcData.title,
        description: op.newKcData.description,
        order: currentKcsSnap.size + appliedCount + 1,
        week: op.newKcData.week || 1,
        objectives: op.newKcData.objectives,
        prerequisiteIds: op.newKcData.prerequisiteIds,
        bkt: deriveBktPriors("intermediate", "undergrad"),
        status: "published",
        source: "ai_material",
        sourceMaterialIds: [proposalData.materialId],
        aliases: [op.newKcData.title.toLowerCase()],
        contentVersion: 1,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      appliedCount++;
    } else if (op.type === "merge_into" && op.targetKcId && op.mergeTargetKcId) {
      const targetRef = kcsCollection.doc(op.mergeTargetKcId);
      const sourceRef = kcsCollection.doc(op.targetKcId);
      const targetDoc = await targetRef.get();
      const sourceDoc = await sourceRef.get();

      if (targetDoc.exists && sourceDoc.exists) {
        const targetData = targetDoc.data()!;
        const sourceData = sourceDoc.data()!;

        // Union objectives & materials
        const mergedObjectives = Array.from(
          new Set([...(targetData.objectives || []), ...(sourceData.objectives || [])])
        );
        const mergedMaterials = Array.from(
          new Set([...(targetData.sourceMaterialIds || []), ...(sourceData.sourceMaterialIds || [])])
        );

        batch.update(targetRef, {
          objectives: mergedObjectives,
          sourceMaterialIds: mergedMaterials,
          mergedFrom: [...(targetData.mergedFrom || []), op.targetKcId],
          updatedAt: Timestamp.now(),
        });

        // Archive source KC instead of deleting to preserve historical data
        batch.update(sourceRef, {
          status: "archived",
          mergedInto: op.mergeTargetKcId,
          updatedAt: Timestamp.now(),
        });
        appliedCount++;
      }
    }
  }

  // Update proposal status
  batch.update(proposalRef, {
    status: "applied",
    appliedAt: Timestamp.now(),
  });

  await batch.commit();
  return { appliedCount };
}

/**
 * Dismisses a pending proposal.
 */
export async function dismissMapProposal({
  classId,
  proposalId,
}: {
  classId: string;
  proposalId: string;
}): Promise<void> {
  const proposalRef = adminDb()
    .collection("classes")
    .doc(classId)
    .collection("mapProposals")
    .doc(proposalId);

  await proposalRef.update({
    status: "dismissed",
    dismissedAt: Timestamp.now(),
  });
}
