import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { generateWithFallback } from "@/lib/ai/router";
import { listMistakes } from "@/lib/mistakes/store";
import { EVALUATION_SYSTEM, evaluationPrompt, evaluationSchema, fallbackEvaluation, linkFor, type Evaluation } from "@/lib/evaluation/evaluate";
import { hasEnoughEvidence, summarize, type MasteryEvidence, type EvidenceSummary } from "@/lib/evaluation/evidence";
import { evidenceSignature } from "@/lib/evaluation/signature";

export const runtime = "nodejs";
export const maxDuration = 90;

const col = () => adminDb().collection("evaluations");

/** Collects what the learner actually did: their wrong answers and their mastery score on each topic. */
async function gather(uid: string): Promise<EvidenceSummary> {
  const mistakes = (await listMistakes(uid)).map((m) => ({
    topic: m.topic,
    classId: m.classId,
    kcId: m.kcId,
    classTitle: m.classTitle,
    question: m.question,
    studentAnswer: m.studentAnswer,
    correctAnswer: m.correctAnswer,
    wrongCount: m.wrongCount,
    mastered: m.mastered,
  }));

  const snap = await adminDb().collection("mastery").where("uid", "==", uid).limit(60).get();
  const rows = snap.docs.map((d) => d.data()).filter((d) => typeof d.kcId === "string" && typeof d.classId === "string" && typeof d.pL === "number");
  const refs = rows.slice(0, 40).map((d) => adminDb().collection("classes").doc(d.classId).collection("kcs").doc(d.kcId));
  const kcs = refs.length ? await adminDb().getAll(...refs) : [];
  const classTitles = new Map<string, string>();
  for (const m of mistakes) if (m.classId) classTitles.set(m.classId, m.classTitle);
  const mastery: MasteryEvidence[] = [];
  kcs.forEach((k, i) => {
    const d = rows[i];
    const title = String(k.data()?.title || "").trim();
    if (k.exists && title) mastery.push({ title, classId: d.classId, kcId: d.kcId, classTitle: classTitles.get(d.classId) || "", pL: d.pL });
  });
  return summarize(mistakes, mastery);
}

function shape(evaluation: Evaluation, summary: EvidenceSummary) {
  return { ...evaluation, plan: evaluation.plan.map((p) => ({ ...p, href: linkFor(p.tool, p.topic, summary.topics) })), gaps: evaluation.gaps };
}

/** The saved evaluation, if there is one, and whether the learner's evidence has changed since. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const [summary, snap] = await Promise.all([gather(caller.uid), col().doc(caller.uid).get()]);
    const saved = snap.data();
    return NextResponse.json({
      ok: true,
      data: {
        enough: hasEnoughEvidence(summary),
        stats: { openMistakes: summary.openMistakes, topicsTracked: summary.topicsTracked, fixed: summary.masteredMistakes },
        evaluation: saved?.evaluation ? shape(saved.evaluation as Evaluation, summary) : null,
        generatedAt: saved?.generatedAt?.toDate?.().toISOString?.() ?? null,
        stale: !!saved && saved.signature !== evidenceSignature(summary),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Makes (or refreshes) the evaluation. If nothing has changed since the last one, the saved one is returned at no cost. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "evaluation", limit: 4, windowMs: 60_000 });
    if (limited) return limited;
    const { force } = await parseJson(req, z.object({ force: z.boolean().optional() }));
    const summary = await gather(caller.uid);
    if (!hasEnoughEvidence(summary)) return NextResponse.json({ ok: true, data: { enough: false, evaluation: null, stale: false } });

    const signature = evidenceSignature(summary);
    const snap = await col().doc(caller.uid).get();
    if (snap.exists && snap.data()?.signature === signature && !force) {
      return NextResponse.json({ ok: true, data: { enough: true, evaluation: shape(snap.data()!.evaluation as Evaluation, summary), stale: false, cached: true } });
    }

    let evaluation: Evaluation | null = null;
    let usedAi = false;
    try {
      await checkRateLimitAndQuota(caller.uid, 4000);
      const r = await generateWithFallback({ task: "student_evaluation", systemInstruction: EVALUATION_SYSTEM, userPrompt: evaluationPrompt(summary), schema: evaluationSchema, temperature: 0.3, userId: caller.uid });
      if (r.data) {
        evaluation = r.data;
        usedAi = true;
      }
    } catch (err) {
      // out of allowance or the AI is busy: a plain evaluation from the numbers is still useful, so show that
      console.warn("[evaluation] AI unavailable, using the numbers only:", err instanceof Error ? err.message : err);
    }
    if (!evaluation) evaluation = fallbackEvaluation(summary);
    await col().doc(caller.uid).set({ uid: caller.uid, evaluation, signature, usedAi, generatedAt: Timestamp.now() });
    return NextResponse.json({ ok: true, data: { enough: true, evaluation: shape(evaluation, summary), stale: false, usedAi } });
  } catch (error) {
    return handleAuthError(error);
  }
}
