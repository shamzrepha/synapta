import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { listMistakes } from "@/lib/mistakes/store";

export const runtime = "nodejs";

/**
 * GET /api/study/mistakes?status=open|mastered|all&classId=&topic=&retest=1
 * With retest=1 the answers are withheld and at most 10 open mistakes are returned (most-missed first).
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
      return NextResponse.json({
        ok: true,
        data: {
          items: items.map((m) => ({ id: m.id, question: m.question, options: m.options, topic: m.topic, classTitle: m.classTitle })),
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
