import { Timestamp } from "@/lib/firebase/admin";
import { PUBLISH_KEYS, type PublishKey } from "@/lib/classes/published";
import { liveStatus, pushToStudents, takeOffline } from "@/lib/classes/live";
import { snapshotLabDesign } from "@/lib/studio/labs";
import type { AuthUser } from "@/lib/auth/requireUser";

interface KcDoc {
  id: string;
  ref: { update: (data: Record<string, unknown>) => Promise<unknown> };
  data: () => Record<string, unknown>;
}

export interface PushAllResult {
  /** how many pieces of content went live */
  pushed: number;
  /** things that could not go live, in words a teacher understands */
  skipped: string[];
  /** topics that have no lecture note at all (students would see an empty topic) */
  emptyTopics: string[];
}

const KEY_WORDS: Record<PublishKey, string> = { lesson: "lecture note", audio: "podcast", simulation: "simulation", practice: "flashcards & quiz" };

/**
 * Pushes (or takes offline) everything that exists across the given topics.
 * Each piece goes on its own, so one that can't go live (a podcast with unrecorded lines) never blocks the rest.
 */
export async function pushClassContent(caller: AuthUser, classId: string, kcs: KcDoc[], published: boolean): Promise<PushAllResult> {
  const result: PushAllResult = { pushed: 0, skipped: [], emptyTopics: [] };
  for (const d of kcs) {
    const data = d.data();
    const title = String(data.title || "Topic");
    if (published) {
      const status = await liveStatus(classId, d.id, data);
      const lesson = status.find((s) => s.key === "lesson");
      if (!lesson?.hasDraft) result.emptyTopics.push(title);
      for (const s of status) {
        if (!s.hasDraft) continue;
        // "follow" topics (older ones) already read the working copy; a snapshot only needs a push when it changed
        if (s.mode === "follow" || (s.mode === "snapshot" && !s.changed)) continue;
        try {
          await pushToStudents(classId, d.id, [s.key]);
          result.pushed += 1;
        } catch (err) {
          result.skipped.push(`${title}: ${KEY_WORDS[s.key]} (${err instanceof Error ? err.message : "failed"})`);
        }
      }
    } else {
      await takeOffline(classId, d.id, [...PUBLISH_KEYS]);
    }
    const labs = Array.isArray(data.labs) ? (data.labs as Array<Record<string, unknown>>) : [];
    if (labs.length) {
      const next = [];
      for (const l of labs) {
        let live: Record<string, unknown> = {};
        if (published) {
          try {
            live = (await snapshotLabDesign(caller, classId, d.id, l as never)) as Record<string, unknown>;
          } catch {
            result.skipped.push(`${title}: a lab couldn't be saved for students`);
            next.push({ ...l, published: false });
            continue;
          }
        }
        next.push({ ...l, ...live, published });
      }
      await d.ref.update({ labs: next, updatedAt: Timestamp.now() });
    }
  }
  return result;
}
