import { adminDb } from "@/lib/firebase/admin";
import { MirrorStateSchema, type MirrorPrefs, type MirrorState, type Signal, emptyMirrorState } from "./schema";
import { applySignals } from "./signals";

/**
 * Persistence for the Learner Mirror: one owner-only document `learnerMirror/{uid}` (Firestore rules deny all client
 * access; only the server reads and writes it) that is deleted with the account (lib/privacy/delete-user.ts).
 * It holds counters and the learner's own edits, never raw events, answers or free text beyond topic titles.
 */
const col = () => adminDb().collection("learnerMirror");

export function parseState(raw: unknown): MirrorState {
  const r = MirrorStateSchema.safeParse(raw ?? {});
  return r.success ? r.data : emptyMirrorState(false);
}

export async function loadMirror(uid: string): Promise<MirrorState> {
  const snap = await col().doc(uid).get();
  return snap.exists ? parseState(snap.data()) : emptyMirrorState(false);
}

/** Folds signals into the stored state atomically. Does nothing (and stores nothing) when personalisation is off. */
export async function recordSignals(uid: string, signals: readonly Signal[], nowMs = Date.now()): Promise<{ accepted: number }> {
  const ref = col().doc(uid);
  return adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    const state = snap.exists ? parseState(snap.data()) : emptyMirrorState(false);
    if (!state.personalise) return { accepted: 0 };
    t.set(ref, applySignals(state, signals, nowMs));
    return { accepted: signals.length };
  });
}

export interface MirrorPatch {
  personalise?: boolean;
  prefs?: Partial<MirrorPrefs>;
}

export async function patchMirror(uid: string, patch: MirrorPatch, nowMs = Date.now()): Promise<MirrorState> {
  const ref = col().doc(uid);
  return adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    const cur = snap.exists ? parseState(snap.data()) : emptyMirrorState(false);
    const next: MirrorState = { ...cur, asOf: cur.asOf || nowMs };
    if (patch.personalise !== undefined) next.personalise = patch.personalise;
    if (patch.prefs) next.prefs = { ...cur.prefs, ...patch.prefs };
    t.set(ref, next);
    return next;
  });
}

/** "Reset": deletes the whole profile (counters, edits and summary). Personalisation goes back to off. */
export async function resetMirror(uid: string): Promise<void> {
  await col().doc(uid).delete();
}

export async function saveSummary(uid: string, text: string, nowMs = Date.now()): Promise<void> {
  await col().doc(uid).set({ summary: { text: text.slice(0, 600), at: nowMs } }, { merge: true });
}
