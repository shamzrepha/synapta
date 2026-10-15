/** Optimistic-concurrency helpers for the shared group notes document. */

export const NOTES_MAX = 20_000;

export type NotesDecision = { kind: "ok"; nextVersion: number } | { kind: "conflict"; currentVersion: number };

/** Decide whether a save based on `baseVersion` may be applied over `currentVersion`. */
export function decideNotesSave(currentVersion: number, baseVersion: number, force = false): NotesDecision {
  if (force || baseVersion === currentVersion) return { kind: "ok", nextVersion: currentVersion + 1 };
  return { kind: "conflict", currentVersion };
}

/**
 * Merge helper for the conflict dialog. If one side did not change from the common base, take the
 * other. Otherwise keep both with visible markers so nothing is lost silently.
 */
export function mergeNotes(base: string, mine: string, theirs: string): { text: string; clean: boolean } {
  if (mine === theirs) return { text: mine, clean: true };
  if (mine === base) return { text: theirs, clean: true };
  if (theirs === base) return { text: mine, clean: true };
  return {
    text: `<<<<<<< my edit\n${mine}\n=======\n${theirs}\n>>>>>>> their edit`,
    clean: false,
  };
}
