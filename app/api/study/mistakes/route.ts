import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { listMistakes } from "@/lib/mistakes/store";
import { ensureVariants } from "@/lib/mistakes/variants";

export const runtime = "nodejs";

/**
 * GET /api/study/mistakes?status=open|mastered|all&classId=&topic=&retest=1
 * With retest=1 at most 10 open mistakes are returned (most-missed first), each as a NEW question on the same idea
 * (never the one already seen), sent with its answer so the check on the phone is instant.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || "all";
    const classId = sp.get("classId") || "";
    const topic = (sp.get("topic") || "").toLowerCase();
    const retest = sp.get("retest") === "1";

    const all = await listMistakes(caller.uid);
    const classes = new Map<string, string>();
    const topics = new Set<string>();
    for (const m of all) {
      if (m.classId) classes.set(m.classId, m.classTitle || "Class");
      if (m.topic) topics.add(m.topic);
    }

    let items = all.filter((m) => {
      if (retest || status === "open") if (m.mastered) return false;
      if (!retest && status === "mastered" && !m.mastered) return false;
      if (classId && m.classId !== classId) return false;
      if (topic && m.topic.toLowerCase() !== topic) return false;
      return true;
    });

    if (retest) {
      items = items.sort((a, b) => b.wrongCount - a.wrongCount).slice(0, 10);
      const variants = await ensureVariants(caller.uid, items);
      return NextResponse.json({
        ok: true,
        data: {
          items: items.map((m) => {
            const v = variants.get(m.id);
            return {
              id: m.id,
              question: v?.question ?? m.question,
              options: v?.options ?? m.options,
              correctIndex: v?.correctIndex ?? m.correctIndex,
              explanation: v?.explanation ?? m.explanation,
              fresh: !!v,
              topic: m.topic,
              classTitle: m.classTitle,
            };
          }),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        items,
        counts: { open: all.filter((m) => !m.mastered).length, mastered: all.filter((m) => m.mastered).length },
        classes: Array.from(classes, ([id, title]) => ({ id, title })),
        topics: Array.from(topics).sort(),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
