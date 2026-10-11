import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { buildPath, paceWeeks, KcPlanNode } from "@/lib/teacher/planner";
import { generateStructuredJson } from "@/lib/gemini/client";
import { recordTokenUsage } from "@/lib/quota/guard";
import { z } from "zod";

export const runtime = "nodejs";

const teacherNoteSchema = z.object({
  note: z.string().max(450),
  todayFocusKcId: z.string(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classId } = await params;
    const caller = await requireUser(req);

    // Verify view permission
    await assertClassAccess(caller, classId, "view");

    // 1. Fetch Class and KCs
    const classDoc = await adminDb().collection("classes").doc(classId).get();
    if (!classDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Class not found" } },
        { status: 404 }
      );
    }

    const kcsSubSnap = await adminDb()
      .collection("classes")
      .doc(classId)
      .collection("kcs")
      .orderBy("order", "asc")
      .get();

    let rawKcs: Array<{
      id: string;
      title: string;
      description?: string;
      order?: number;
      prerequisiteIds?: string[];
      lab?: { type?: string };
    }> = [];

    if (!kcsSubSnap.empty) {
      rawKcs = kcsSubSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as {
          title: string;
          description?: string;
          order?: number;
          prerequisiteIds?: string[];
          lab?: { type?: string };
        }),
      }));
    } else {
      const cData = classDoc.data();
      if (Array.isArray(cData?.kcs)) {
        rawKcs = cData.kcs;
      }
    }

    // 2. Fetch Learner's Mastery Records for this class
    const masterySnap = await adminDb()
      .collection("mastery")
      .where("uid", "==", caller.uid)
      .where("classId", "==", classId)
      .get();

    const masteryMap: Record<string, number> = {};
    const reviewDueSet = new Set<string>();
    const nowMillis = Date.now();

    masterySnap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.kcId) {
        masteryMap[d.kcId] = typeof d.pL === "number" ? d.pL : 0.20;
        if (d.nextReviewAt) {
          const dueMillis = d.nextReviewAt.toMillis ? d.nextReviewAt.toMillis() : new Date(d.nextReviewAt).getTime();
          if (dueMillis <= nowMillis && d.pL >= 0.50) {
            reviewDueSet.add(d.kcId);
          }
        }
      }
    });

    // 3. Fetch Open Misconceptions for this class
    const misSnap = await adminDb()
      .collection("misconceptions")
      .where("uid", "==", caller.uid)
      .where("classId", "==", classId)
      .where("resolved", "==", false)
      .get();

    const misconceptionCountMap = new Map<string, number>();
    misSnap.docs.forEach((doc) => {
      const d = doc.data();
      misconceptionCountMap.set(d.kcId, (misconceptionCountMap.get(d.kcId) || 0) + 1);
    });

    // 4. Fetch Learner Goal for this class
    const profileDoc = await adminDb().collection("learnerProfiles").doc(caller.uid).get();
    const profileData = profileDoc.exists ? profileDoc.data() : {};
    const goals = Array.isArray(profileData?.goals) ? profileData.goals : [];
    const classGoal = goals.find((g: { classId: string }) => g.classId === classId) || null;

    // 5. Build Graph Nodes & Edges
    const planNodes: KcPlanNode[] = rawKcs.map((k) => ({
      id: k.id,
      title: k.title,
      prerequisiteIds: k.prerequisiteIds || [],
      order: k.order,
      hasLab: !!k.lab && k.lab.type !== "none",
    }));

    const recommendedPath = buildPath({
      kcs: planNodes,
      masteryMap,
    });

    const edges: Array<{ id: string; source: string; target: string }> = [];
    const nodes = rawKcs.map((kc) => {
      const pL = masteryMap[kc.id] ?? 0.20;
      const prereqs = kc.prerequisiteIds || [];
      const prereqsMet = prereqs.length === 0 || prereqs.every((pid) => (masteryMap[pid] ?? 0.20) >= 0.70);
      const isDueReview = reviewDueSet.has(kc.id);

      let status: "locked" | "available" | "learning" | "mastered" | "due_review" = "locked";
      if (isDueReview) {
        status = "due_review";
      } else if (pL >= 0.95) {
        status = "mastered";
      } else if (pL >= 0.35) {
        status = "learning";
      } else if (prereqsMet) {
        status = "available";
      }

      // Populate edges
      prereqs.forEach((pid) => {
        edges.push({
          id: `e-${pid}-${kc.id}`,
          source: pid,
          target: kc.id,
        });
      });

      const parentId = (kc as { parentId?: string | null }).parentId || null;
      if (parentId && !prereqs.includes(parentId)) {
        edges.push({
          id: `h-${parentId}-${kc.id}`,
          source: parentId,
          target: kc.id,
        });
      }

      return {
        id: kc.id,
        title: kc.title,
        description: kc.description || "",
        order: kc.order ?? 0,
        pL: Number((pL * 100).toFixed(1)),
        rawPL: pL,
        status,
        hasLab: !!kc.lab && kc.lab.type !== "none",
        misconceptionCount: misconceptionCountMap.get(kc.id) || 0,
        prerequisiteIds: prereqs,
        parentId,
      };
    });

    // 6. Calculate Velocity & Pacing
    const pacing = paceWeeks({
      pathLength: recommendedPath.length,
      targetDate: classGoal?.targetDate || null,
      minutesPerDay: classGoal?.minutesPerDay || 30,
    });

    // 7. Cached AI Teacher Note (Daily cached note)
    const todayStr = new Date().toISOString().slice(0, 10);
    const planCacheId = `${caller.uid}_${classId}_${todayStr}`;
    const planCacheRef = adminDb().collection("learnerPlans").doc(planCacheId);
    const planCacheDoc = await planCacheRef.get();

    let teacherNote = {
      note: "Focus on your next unlocked knowledge component. Work through the concept and test your understanding with active practice.",
      todayFocusKcId: recommendedPath[0]?.kc.id || rawKcs[0]?.id || "",
    };

    if (planCacheDoc.exists) {
      teacherNote = planCacheDoc.data() as typeof teacherNote;
    } else if (recommendedPath.length > 0) {
      try {
        const topKc = recommendedPath[0];
        const systemInstruction = `You are Synapta's empathetic, encouraging AI Teacher.
Write a concise, 2-3 sentence personalized pedagogical daily note to the learner based on their structured study plan.
Guidelines:
- Mention the target concept to focus on today ("${topKc.kc.title}").
- Provide a clear, actionable reason why (e.g. foundational prerequisite, practicing with interactive lab, or reviewing misconceptions).
- Encourage growth mindset. Do NOT use buzzwords or fluff. Max 350 characters.
- Return strict JSON matching the schema.`;

        const userPrompt = `Pacing Status: ${pacing.status} (${pacing.statusMessage})
Focus KC: ${topKc.kc.title} (Current mastery P(L): ${(topKc.currentPL * 100).toFixed(1)}%)
Recommended Activity: ${topKc.activity}
Open Misconceptions: ${misconceptionCountMap.get(topKc.kc.id) || 0}
Target Deadline: ${classGoal?.targetDate || "Not set"}`;

        const { data, tokensIn, tokensOut } = await generateStructuredJson({
          systemInstruction,
          userPrompt,
          schema: teacherNoteSchema,
        });

        await recordTokenUsage(caller.uid, tokensIn, tokensOut).catch(() => {});

        teacherNote = {
          note: data.note,
          todayFocusKcId: topKc.kc.id,
        };

        await planCacheRef.set({
          ...teacherNote,
          classId,
          uid: caller.uid,
          date: todayStr,
          createdAt: Timestamp.now(),
        });
      } catch (err) {
        console.warn("Failed to generate daily teacher note, using deterministic fallback:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        classId,
        nodes,
        edges,
        recommendedPath: recommendedPath.map((p) => ({
          kcId: p.kc.id,
          title: p.kc.title,
          currentPL: Number((p.currentPL * 100).toFixed(1)),
          isUnlocked: p.isUnlocked,
          activity: p.activity,
        })),
        pacing,
        goal: classGoal,
        teacherNote,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
