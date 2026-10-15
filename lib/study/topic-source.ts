import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError } from "@/lib/api/errors";
import type { AuthenticatedUser } from "@/lib/auth/requireUser";

/** Either pasted text/topic, or a class topic (classId + kcId). */
export const topicSourceShape = {
  text: z.string().trim().max(12_000).optional(),
  classId: z.string().min(1).max(200).optional(),
  kcId: z.string().min(1).max(200).optional(),
};

export const topicSourceSchema = z.object(topicSourceShape).refine((v) => (v.classId && v.kcId) || (v.text && v.text.length >= 3), {
  message: "Paste some text or pick a class topic",
});

export interface TopicSource {
  title: string;
  text: string;
}

/** Resolves the source material, enforcing class access for class topics. */
export async function resolveTopicSource(
  caller: AuthenticatedUser,
  src: { text?: string; classId?: string; kcId?: string },
  maxChars = 10_000
): Promise<TopicSource> {
  if (src.classId && src.kcId) {
    await assertClassAccess(caller, src.classId, "view");
    const doc = await adminDb().collection("classes").doc(src.classId).collection("kcs").doc(src.kcId).get();
    if (!doc.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found");
    const kc = doc.data() || {};
    const body = [kc.description, Array.isArray(kc.objectives) ? kc.objectives.join("\n") : "", kc.lessonMarkdown]
      .filter((x) => typeof x === "string" && x)
      .join("\n\n");
    return { title: String(kc.title || "Topic"), text: body.slice(0, maxChars) || String(kc.title || "") };
  }
  const text = (src.text || "").slice(0, maxChars);
  const firstLine = text.split("\n")[0].trim();
  return { title: firstLine.length <= 60 ? firstLine : `${firstLine.slice(0, 57)}…`, text };
}

/** Escapes the closing delimiter so pasted text can't break out of <USER_INPUT>. */
export function wrapUserInput(text: string): string {
  return `<USER_INPUT>\n${text.replace(/<\/?USER_INPUT>/gi, "")}\n</USER_INPUT>`;
}
