export interface MisconceptionDoc {
  uid: string;
  classId: string;
  kcId: string;
  label: string;
  description: string;
  occurrences: number;
  consecutiveCorrect: number;
  resolved: boolean;
  firstSeenAt: unknown;
  lastSeenAt: unknown;
}

export function sanitizeMisconceptionId(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/**
 * Pure evaluation function for misconception state transition.
 */
export function evaluateMisconceptionTransition({
  current,
  isCorrect,
  label,
  description,
}: {
  current?: Partial<MisconceptionDoc> | null;
  isCorrect: boolean;
  label: string;
  description?: string;
}): {
  occurrences: number;
  consecutiveCorrect: number;
  resolved: boolean;
} {
  const occurrences = current?.occurrences ?? 0;
  const consecutiveCorrect = current?.consecutiveCorrect ?? 0;

  if (!isCorrect) {
    return {
      occurrences: occurrences + 1,
      consecutiveCorrect: 0,
      resolved: false,
    };
  }

  // If learner answered correctly on a question covering this KC
  const nextConsecutive = consecutiveCorrect + 1;
  const resolved = nextConsecutive >= 2;

  return {
    occurrences,
    consecutiveCorrect: nextConsecutive,
    resolved,
  };
}

/**
 * Records or updates a diagnosed misconception in Firestore.
 */
export async function trackMisconception({
  uid,
  classId,
  kcId,
  label,
  description = "",
  isCorrect,
}: {
  uid: string;
  classId: string;
  kcId: string;
  label: string;
  description?: string;
  isCorrect: boolean;
}): Promise<{ resolved: boolean; occurrences: number }> {
  const { adminDb, Timestamp } = await import("@/lib/firebase/admin");
  const cleanId = sanitizeMisconceptionId(label);
  const docId = `${uid}_${kcId}_${cleanId}`;
  const docRef = adminDb().collection("misconceptions").doc(docId);

  const snap = await docRef.get();
  const existing = snap.exists ? (snap.data() as MisconceptionDoc) : null;

  // If already resolved and this is a correct answer, skip writing
  if (existing?.resolved && isCorrect) {
    return { resolved: true, occurrences: existing.occurrences };
  }

  const transition = evaluateMisconceptionTransition({
    current: existing,
    isCorrect,
    label,
    description,
  });

  const now = Timestamp.now();

  const dataToSave = {
    uid,
    classId,
    kcId,
    label,
    description: description || existing?.description || label,
    occurrences: transition.occurrences,
    consecutiveCorrect: transition.consecutiveCorrect,
    resolved: transition.resolved,
    lastSeenAt: now,
    ...(existing ? {} : { firstSeenAt: now }),
  };

  await docRef.set(dataToSave, { merge: true });

  return {
    resolved: transition.resolved,
    occurrences: transition.occurrences,
  };
}
