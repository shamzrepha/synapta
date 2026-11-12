import { adminDb } from "@/lib/firebase/admin";
import { getAudienceSystemPrompt } from "@/lib/ai/prompts";
import { parseAccessibility, profileTagsFromAccessibility } from "./accessibility";

/**
 * Loads the learner's saved accessibility/neurodiversity profile tags from Firestore.
 * Degrades cleanly to `[]` if the profile or Firestore is unavailable.
 */
export async function loadLearnerAudienceTags(uid: string): Promise<string[]> {
  try {
    const snap = await adminDb().collection("users").doc(uid).get();
    const data = snap.exists ? snap.data() : undefined;
    if (!data?.accessibility) return [];
    return profileTagsFromAccessibility(parseAccessibility(data.accessibility));
  } catch {
    return [];
  }
}

/**
 * Returns the formatted AI system-prompt instructions derived from the learner's saved
 * accessibility preferences (`adhdFocus`, `literalMode`, `kidsMode`), or `""` when none apply.
 */
export async function loadLearnerAudienceInstruction(
  uid: string,
  extra?: { masteryProbability?: number },
): Promise<string> {
  const tags = await loadLearnerAudienceTags(uid);
  if (tags.length === 0) return "";
  const isKids = tags.includes("kids");
  return getAudienceSystemPrompt({
    profileTags: tags,
    masteryProbability: isKids ? undefined : extra?.masteryProbability,
  }).trim();
}

/**
 * Appends saved learner accessibility instructions to an optional base system prompt.
 */
export async function appendLearnerAudience(
  uid: string,
  base?: string,
  extra?: { masteryProbability?: number },
): Promise<string | undefined> {
  const note = await loadLearnerAudienceInstruction(uid, extra);
  if (!note) return base;
  return base ? `${base}\n\n${note}` : note;
}
