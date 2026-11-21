import fs from "node:fs";
import path from "node:path";
import { adminDb, Timestamp } from "../lib/firebase/admin";

function loadEnvLocal() {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* .env.local not present */
  }
}

/**
 * Idempotent migration script: Backfill schoolId on users and posts
 * whose free-text institution name matches a school's name (case-insensitive),
 * or whose post author belongs to that school.
 *
 * Usage:
 *   npx tsx scripts/backfill-school-id.ts           # Dry run (default)
 *   npx tsx scripts/backfill-school-id.ts --apply   # Apply writes to Firestore
 */
async function main() {
  loadEnvLocal();
  const isApply = process.argv.includes("--apply");

  console.log("=======================================================");
  console.log(" Sunroot schoolId Backfill Script");
  console.log(` Mode: ${isApply ? "APPLYING WRITES TO FIRESTORE" : "DRY RUN (No writes)"}`);
  console.log("=======================================================\n");

  const db = adminDb();

  const [schoolsSnap, usersSnap, postsSnap] = await Promise.all([
    db.collection("schools").get(),
    db.collection("users").get(),
    db.collection("posts").get(),
  ]);

  // Map normalized school name -> school document (if duplicates exist, earliest created wins)
  const schoolByName = new Map<string, { id: string; name: string; createdAtMs: number }>();
  for (const sDoc of schoolsSnap.docs) {
    const sd = sDoc.data() || {};
    const name = typeof sd.name === "string" ? sd.name.trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    const createdAtMs = sd.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    const existing = schoolByName.get(key);
    if (!existing || createdAtMs < existing.createdAtMs) {
      schoolByName.set(key, { id: sDoc.id, name, createdAtMs });
    }
  }

  console.log(`Loaded ${schoolsSnap.size} school docs (${schoolByName.size} distinct case-insensitive names).`);
  console.log(`Loaded ${usersSnap.size} user docs and ${postsSnap.size} post docs.\n`);

  const userUpdates: Array<{
    uid: string;
    displayName: string;
    institution: string;
    schoolId: string;
    schoolName: string;
  }> = [];

  // Also track every user's resolved schoolId so posts by those users can be backfilled
  const resolvedUserSchoolId = new Map<string, { schoolId: string; schoolName: string }>();

  for (const uDoc of usersSnap.docs) {
    const u = uDoc.data() || {};
    const existingSchoolId = typeof u.schoolId === "string" ? u.schoolId.trim() : "";
    const inst = typeof u.institution === "string" ? u.institution.trim() : "";

    if (existingSchoolId) {
      resolvedUserSchoolId.set(uDoc.id, { schoolId: existingSchoolId, schoolName: inst });
      continue;
    }
    if (!inst) continue;

    const matchedSchool = schoolByName.get(inst.toLowerCase());
    if (!matchedSchool) continue;

    resolvedUserSchoolId.set(uDoc.id, { schoolId: matchedSchool.id, schoolName: matchedSchool.name });
    userUpdates.push({
      uid: uDoc.id,
      displayName: String(u.displayName || u.username || "User"),
      institution: inst,
      schoolId: matchedSchool.id,
      schoolName: matchedSchool.name,
    });
  }

  const postUpdates: Array<{
    postId: string;
    authorUid: string;
    authorInstitution: string;
    schoolId: string;
    schoolName: string;
    matchReason: "authorInstitution" | "authorUserSchoolId";
  }> = [];

  for (const pDoc of postsSnap.docs) {
    const p = pDoc.data() || {};
    const existingSchoolId = typeof p.schoolId === "string" ? p.schoolId.trim() : "";
    if (existingSchoolId) continue;

    const authorInst = typeof p.authorInstitution === "string" ? p.authorInstitution.trim() : "";
    const byInst = authorInst ? schoolByName.get(authorInst.toLowerCase()) : undefined;
    const byAuthor = typeof p.authorUid === "string" ? resolvedUserSchoolId.get(p.authorUid) : undefined;

    if (byInst) {
      postUpdates.push({
        postId: pDoc.id,
        authorUid: String(p.authorUid || ""),
        authorInstitution: authorInst,
        schoolId: byInst.id,
        schoolName: byInst.name,
        matchReason: "authorInstitution",
      });
    } else if (byAuthor) {
      postUpdates.push({
        postId: pDoc.id,
        authorUid: String(p.authorUid || ""),
        authorInstitution: authorInst || byAuthor.schoolName,
        schoolId: byAuthor.schoolId,
        schoolName: byAuthor.schoolName,
        matchReason: "authorUserSchoolId",
      });
    }
  }

  console.log(`Summary:`);
  console.log(`  - Users to backfill with schoolId: ${userUpdates.length}`);
  console.log(`  - Posts to backfill with schoolId: ${postUpdates.length}\n`);

  console.log(`First 10 examples (users + posts):`);
  const examples = [
    ...userUpdates.map((u) => `[USER] uid=${u.uid} (${u.displayName}) institution="${u.institution}" -> schoolId=${u.schoolId} ("${u.schoolName}")`),
    ...postUpdates.map((p) => `[POST] id=${p.postId} authorUid=${p.authorUid} inst="${p.authorInstitution}" (${p.matchReason}) -> schoolId=${p.schoolId} ("${p.schoolName}")`),
  ].slice(0, 10);

  if (examples.length === 0) {
    console.log("  (None — 0 unlinked matching users or posts found)");
  } else {
    examples.forEach((ex, idx) => console.log(`  ${idx + 1}. ${ex}`));
  }

  if (!isApply) {
    console.log("\nDry run complete. No documents were modified. Pass --apply to write changes.");
    return;
  }

  const now = Timestamp.now();
  let writtenUsers = 0;
  for (let i = 0; i < userUpdates.length; i += 400) {
    const batch = db.batch();
    for (const u of userUpdates.slice(i, i + 400)) {
      batch.set(db.collection("users").doc(u.uid), { schoolId: u.schoolId, updatedAt: now }, { merge: true });
      writtenUsers++;
    }
    await batch.commit();
  }

  let writtenPosts = 0;
  for (let i = 0; i < postUpdates.length; i += 400) {
    const batch = db.batch();
    for (const p of postUpdates.slice(i, i + 400)) {
      batch.set(db.collection("posts").doc(p.postId), { schoolId: p.schoolId }, { merge: true });
      writtenPosts++;
    }
    await batch.commit();
  }

  console.log(`\nApplied backfill: updated ${writtenUsers} user(s) and ${writtenPosts} post(s).`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
