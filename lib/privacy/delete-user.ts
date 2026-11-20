import { createHash } from "crypto";

/**
 * Deletes one learner's personal data from Firestore (the Auth user and cookie are handled by the route).
 *
 * Policy (mirrored in /privacy):
 * - Personal learning data, notes, notebooks the user owns, saved items, friends and notifications: deleted.
 * - Feed posts the user wrote: deleted. Comments the user wrote (feed, polls, communities): kept so threads still read
 *   properly, but anonymised (authorUid "deleted", text "[deleted]").
 * - Payments: kept for legal and accounting retention, with personal fields (email, name) removed and the uid replaced
 *   by a one-way pseudonym.
 * - Classes the user teaches are NOT touched: the route refuses first (see findOwnedClasses).
 * Deleting is idempotent: running it again on a partly deleted account finishes the job. The users/{uid} document goes last,
 * and only when every earlier step succeeded, so a failed run can simply be retried by the still-signed-in user.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;
type DocSnap = { id: string; ref: any; data: () => Record<string, any> | undefined };

const BATCH = 400;
const MAX_ROUNDS = 200;

/** Top-level collections where each document carries the owner in `field`. */
export const QUERY_COLLECTIONS: ReadonlyArray<readonly [collection: string, field: string]> = [
  ["mastery", "uid"], // doc ids are {uid}_{kcId}
  ["evidence", "uid"],
  ["misconceptions", "uid"],
  ["mistakes", "uid"],
  ["flashcards", "uid"],
  ["flashcardDecks", "uid"],
  ["studyNotes", "uid"], // + versions subcollection, handled below
  ["notebooks", "ownerUid"],
  ["mindMaps", "uid"],
  ["snapHistory", "uid"],
  ["paperAttempts", "uid"],
  ["examPlans", "uid"],
  ["studyGoals", "uid"],
  ["learnerPlans", "uid"],
  ["quizSessions", "uid"],
  ["diagnosticSessions", "uid"],
  ["focusSessions", "uid"],
  ["practiceHistory", "uid"],
  ["usage", "uid"],
  ["enrollments", "uid"],
  ["posts", "authorUid"],
  ["friend_requests", "fromUid"],
  ["friend_requests", "toUid"],
];

/** Top-level documents whose id is exactly the uid. */
export const UID_DOCS = ["learnerProfiles", "avatars", "dailyStreaks"] as const;

/** Subcollections of users/{uid}. */
export const USER_SUBCOLLECTIONS = [
  "friends", "following", "followers", "notifications", "pushTokens", "bookmarks", "cards", "reviewLogs",
  "pastQuestionAttempts", "paths", "pendingShares", "progress", "quests", "seasonProgress", "weeklyReports", "communities",
] as const;

/** Lists under users/{uid} that are mirrored on the other person's profile. */
const MIRRORS: ReadonlyArray<readonly [from: string, otherSub: string]> = [
  ["friends", "friends"],
  ["following", "followers"],
  ["followers", "following"],
];

export interface DeleteOptions {
  dryRun?: boolean;
}
export interface DeleteReport {
  dryRun: boolean;
  /** documents deleted (or that would be) per area */
  counts: Record<string, number>;
  anonymised: number;
  paymentsRedacted: number;
  /** areas that could not be processed (the rest still ran); empty on a clean run */
  errors: string[];
}

export function pseudonym(uid: string): string {
  return `deleted_${createHash("sha256").update(uid).digest("hex").slice(0, 16)}`;
}

/** Classes this user teaches. Deleting the account must not silently destroy them. */
export async function findOwnedClasses(db: Db, uid: string): Promise<Array<{ id: string; name: string }>> {
  const snap = await db.collection("classes").where("teacherId", "==", uid).limit(50).get();
  return snap.docs.map((d: DocSnap) => ({ id: d.id, name: String(d.data()?.name || d.data()?.title || d.id) }));
}

async function deleteRefs(db: Db, refs: any[]): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH) {
    const b = db.batch();
    for (const r of refs.slice(i, i + BATCH)) b.delete(r);
    await b.commit();
  }
}

/** Deletes every doc matching a query, in batches. A dry run only counts the first page. */
async function sweep(db: Db, q: () => any, dry: boolean, onDocs?: (docs: DocSnap[]) => Promise<void>): Promise<number> {
  let total = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const snap = await q().limit(BATCH).get();
    const docs = snap.docs as DocSnap[];
    if (docs.length === 0) break;
    total += docs.length;
    if (dry) break;
    if (onDocs) await onDocs(docs);
    await deleteRefs(db, docs.map((d) => d.ref));
    if (docs.length < BATCH) break;
  }
  return total;
}

export async function deleteUserData(db: Db, uid: string, opts: DeleteOptions = {}): Promise<DeleteReport> {
  if (!uid || typeof uid !== "string" || uid.includes("/")) throw new Error("deleteUserData: invalid uid");
  const dry = !!opts.dryRun;
  const report: DeleteReport = { dryRun: dry, counts: {}, anonymised: 0, paymentsRedacted: 0, errors: [] };
  const add = (k: string, n: number) => {
    if (n) report.counts[k] = (report.counts[k] || 0) + n;
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      report.errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const userRef = db.collection("users").doc(uid);

  // 1. Mirror entries on other people's profiles, before our own lists are gone.
  for (const [sub, otherSub] of MIRRORS) {
    await step(`mirror:${sub}`, async () => {
      const mine = await userRef.collection(sub).limit(1000).get();
      const refs = (mine.docs as DocSnap[]).map((d) => db.collection("users").doc(d.id).collection(otherSub).doc(uid));
      add(`users.*.${otherSub}`, refs.length);
      if (!dry) await deleteRefs(db, refs);
    });
  }

  // 2. Owner-keyed collections.
  for (const [col, field] of QUERY_COLLECTIONS) {
    await step(col, async () => {
      const onDocs =
        col === "studyNotes"
          ? async (docs: DocSnap[]) => {
              for (const d of docs) add("studyNotes.versions", await sweep(db, () => d.ref.collection("versions"), false));
            }
          : undefined;
      add(col, await sweep(db, () => db.collection(col).where(field, "==", uid), dry, onDocs));
    });
  }

  // 3. Documents keyed by uid, and the daily activity log.
  for (const col of UID_DOCS) {
    await step(col, async () => {
      const ref = db.collection(col).doc(uid);
      if ((await ref.get()).exists) {
        add(col, 1);
        if (!dry) await ref.delete();
      }
    });
  }
  await step("activityDays", async () => {
    const ref = db.collection("activityDays").doc(uid);
    add("activityDays.days", await sweep(db, () => ref.collection("days"), dry));
    if (!dry && (await ref.get()).exists) await ref.delete();
  });

  // 4. users/{uid} subcollections.
  for (const sub of USER_SUBCOLLECTIONS) {
    await step(`users.${sub}`, async () => {
      add(`users.${sub}`, await sweep(db, () => userRef.collection(sub), dry));
    });
  }

  // 5. Comments: anonymise, never leave a hole in someone else's thread.
  if (typeof db.collectionGroup === "function") {
    await step("comments", async () => {
      const snap = await db.collectionGroup("comments").where("authorUid", "==", uid).limit(1000).get();
      for (let i = 0; i < snap.docs.length; i += BATCH) {
        const chunk = snap.docs.slice(i, i + BATCH);
        report.anonymised += chunk.length;
        if (dry) continue;
        const b = db.batch();
        for (const d of chunk) b.update(d.ref, { authorUid: "deleted", authorName: "Deleted user", authorPhoto: null, text: "[deleted]" });
        await b.commit();
      }
    });
  }

  // 6. Payments: keep for accounting, strip personal fields.
  await step("payments", async () => {
    const snap = await db.collection("payments").where("uid", "==", uid).limit(1000).get();
    const alias = pseudonym(uid);
    for (const d of snap.docs as DocSnap[]) {
      const p = d.data() || {};
      report.paymentsRedacted++;
      if (dry) continue;
      await d.ref.set({
        reference: p.reference ?? d.id, uid: alias, plan: p.plan ?? null, term: p.term ?? null, amountKobo: p.amountKobo ?? null,
        channel: p.channel ?? null, at: p.at ?? null, expiresAt: p.expiresAt ?? null, redacted: true,
      });
    }
  });

  // 7. Last: the profile itself.
  if (report.errors.length === 0 && (await userRef.get()).exists) {
    add("users", 1);
    if (!dry) await userRef.delete();
  }
  return report;
}
