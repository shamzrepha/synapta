import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const PER_COLLECTION = 500;
const MAX_BYTES = 4_000_000;

/** Fields that are secrets or about other people, never exported. */
const OMIT = new Set(["token", "fcmToken", "pushTokens", "email_hash"]);

/** [bundle key, collection, owner field] */
const SOURCES: ReadonlyArray<readonly [string, string, string]> = [
  ["mastery", "mastery", "uid"],
  ["evidence", "evidence", "uid"],
  ["misconceptions", "misconceptions", "uid"],
  ["mistakes", "mistakes", "uid"],
  ["notes", "studyNotes", "uid"],
  ["flashcardDecks", "flashcardDecks", "uid"],
  ["flashcards", "flashcards", "uid"],
  ["notebooks", "notebooks", "ownerUid"],
  ["mindMaps", "mindMaps", "uid"],
  ["snapHistory", "snapHistory", "uid"],
  ["paperAttempts", "paperAttempts", "uid"],
  ["examPlans", "examPlans", "uid"],
  ["studyGoals", "studyGoals", "uid"],
  ["quizSessions", "quizSessions", "uid"],
  ["enrollments", "enrollments", "uid"],
  ["posts", "posts", "authorUid"],
];

function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.toDate === "function") return (o as { toDate: () => Date }).toDate().toISOString();
    return Object.fromEntries(Object.entries(o).filter(([k]) => !OMIT.has(k)).map(([k, x]) => [k, clean(x)]));
  }
  return v;
}

/** The caller's own data as a JSON download. Only documents they own; capped in size; rate limited. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "data_export", limit: 3, windowMs: 3_600_000, shared: true });
    if (limited) return limited;
    const db = adminDb();
    const truncated: string[] = [];
    const bundle: Record<string, unknown> = { exportedAt: new Date().toISOString(), uid: caller.uid };

    const user = await db.collection("users").doc(caller.uid).get();
    bundle.profile = clean(user.data() ?? null);
    const learner = await db.collection("learnerProfiles").doc(caller.uid).get();
    bundle.learnerProfile = clean(learner.data() ?? null);
    const pq = await db.collection("users").doc(caller.uid).collection("pastQuestionAttempts").limit(PER_COLLECTION).get();
    bundle.pastQuestionAttempts = pq.docs.map((d) => ({ id: d.id, ...(clean(d.data()) as object) }));

    let bytes = JSON.stringify(bundle).length;
    for (const [key, col, field] of SOURCES) {
      const snap = await db.collection(col).where(field, "==", caller.uid).limit(PER_COLLECTION).get();
      let docs = snap.docs.map((d) => ({ id: d.id, ...(clean(d.data()) as object) }));
      if (snap.size >= PER_COLLECTION) truncated.push(key);
      const size = JSON.stringify(docs).length;
      if (bytes + size > MAX_BYTES) {
        docs = [];
        truncated.push(`${key} (size cap)`);
      } else bytes += size;
      bundle[key] = docs;
    }
    bundle.truncated = truncated;
    bundle.note = "Your own data only. Evidence rows are your answer history. Collections stop at 500 items; contact privacy@sunrootlearn.com for a full copy.";

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="sunroot-my-data.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
