import { ApiError } from "@/lib/api/errors";

/**
 * Teacher-first content: the teacher creates (and pays the AI cost for) a topic's lecture note,
 * podcast, simulation, flashcards and quiz, reviews them, then publishes. Students only ever see
 * what is published and never trigger generation. Labs carry their own `published` flag.
 *
 * Topics created before this existed have no `contentPublished` map; they count as published so
 * existing classes keep working.
 */
export const PUBLISH_KEYS = ["lesson", "audio", "simulation", "practice"] as const;
export type PublishKey = (typeof PUBLISH_KEYS)[number];
export type PublishMap = Record<PublishKey, boolean>;

export const PUBLISH_LABEL: Record<PublishKey, string> = {
  lesson: "Lecture note",
  audio: "Voice-over podcast",
  simulation: "Simulation",
  practice: "Flashcards & quiz",
};

/** What a brand-new topic starts with: everything is a draft. */
export function draftMap(): PublishMap {
  return { lesson: false, audio: false, simulation: false, practice: false };
}

type KcLike = object | undefined | null;

export function publishMapOf(kc: KcLike): PublishMap {
  const raw = (kc as { contentPublished?: unknown } | undefined | null)?.contentPublished;
  if (!raw || typeof raw !== "object") return { lesson: true, audio: true, simulation: true, practice: true };
  // `true` = reads the working copy (older topics), an object = a pushed snapshot
  const m = raw as Partial<Record<PublishKey, unknown>>;
  const on = (v: unknown) => v === true || (!!v && typeof v === "object");
  return { lesson: on(m.lesson), audio: on(m.audio), simulation: on(m.simulation), practice: on(m.practice) };
}

export function isPublished(kc: KcLike, key: PublishKey): boolean {
  return publishMapOf(kc)[key];
}

/** Students are stopped here when something is still a draft. Teachers and admins always pass. */
export function assertPublished(canMutate: boolean, kc: KcLike, key: PublishKey) {
  if (canMutate || isPublished(kc, key)) return;
  throw new ApiError(403, "NOT_PUBLISHED", `Your teacher hasn't published the ${PUBLISH_LABEL[key].toLowerCase()} yet.`);
}
