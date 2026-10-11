/**
 * Synapta Demo Data Purge Script
 *
 * Scans Firestore collections for lingering mock/demo data, demo accounts,
 * synthetic evidence logs, or demo classrooms.
 *
 * Usage:
 *   npx tsx scripts/purge-demo-data.ts           # Dry-run mode (default, no data modified)
 *   npx tsx scripts/purge-demo-data.ts --execute # Permanently deletes discovered demo documents
 */

import fs from "fs";
import path from "path";

try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {
  // ignore
}

import { adminDb } from "../lib/firebase/admin";

const isExecuteMode = process.argv.includes("--execute");

async function purgeDemoData() {
  console.log(`=======================================================`);
  console.log(` Synapta Demo & Mock Data Purge Utility`);
  console.log(` Mode: ${isExecuteMode ? "⚠️  EXECUTE (PERMANENT DELETE)" : "🔍 DRY RUN (Audit Only)"}`);
  console.log(`=======================================================\n`);

  const db = adminDb();
  let candidateDocs: { collection: string; id: string; reason: string }[] = [];

  // 1. Audit Users collection
  console.log("Auditing [users] collection...");
  try {
    const usersSnap = await db.collection("users").get();
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const email = (data.email || "").toLowerCase();
      const name = (data.displayName || "").toLowerCase();
      const uid = doc.id;

      if (
        uid.startsWith("demo_") ||
        uid.startsWith("mock_") ||
        uid.startsWith("test_") ||
        name === "alex rivera" ||
        email.endsWith("@example.com") ||
        email.endsWith("@test.com") ||
        email.endsWith("@synapta.test") ||
        email === "alex@synapta.edu"
      ) {
        candidateDocs.push({
          collection: "users",
          id: uid,
          reason: `Demo/Mock User Identity: ${data.displayName || "Unknown"} (${data.email || "No email"})`,
        });
      }
    }
  } catch (err) {
    console.warn("Could not audit users collection:", err);
  }

  // 2. Audit Classes collection
  console.log("Auditing [classes] collection...");
  try {
    const classesSnap = await db.collection("classes").get();
    for (const doc of classesSnap.docs) {
      const data = doc.data();
      const title = (data.title || "").toLowerCase();
      const classId = doc.id;

      if (
        classId.startsWith("demo-") ||
        classId.startsWith("mock-") ||
        classId.startsWith("test-") ||
        title.includes("demo class") ||
        title.includes("mock course") ||
        Boolean(data.isDemo)
      ) {
        candidateDocs.push({
          collection: "classes",
          id: classId,
          reason: `Demo Classroom: "${data.title || "Untitled"}"`,
        });
      }
    }
  } catch (err) {
    console.warn("Could not audit classes collection:", err);
  }

  // 3. Audit Rooms collection
  console.log("Auditing [rooms] collection...");
  try {
    const roomsSnap = await db.collection("rooms").get();
    for (const doc of roomsSnap.docs) {
      const data = doc.data();
      const code = doc.id.toUpperCase();
      const topic = (data.topic || "").toLowerCase();

      if (
        code.startsWith("DEMO") ||
        code.startsWith("TEST") ||
        topic.includes("mock room") ||
        topic.includes("demo room")
      ) {
        candidateDocs.push({
          collection: "rooms",
          id: doc.id,
          reason: `Demo Lounge Room: "${data.topic || code}"`,
        });
      }
    }
  } catch (err) {
    console.warn("Could not audit rooms collection:", err);
  }

  // 4. Audit Evidence collection
  console.log("Auditing [evidence] collection...");
  try {
    const evidenceSnap = await db.collection("evidence").get();
    for (const doc of evidenceSnap.docs) {
      const data = doc.data();
      const uid = data.uid || "";

      if (uid.startsWith("demo_") || uid.startsWith("mock_") || uid.startsWith("test_")) {
        candidateDocs.push({
          collection: "evidence",
          id: doc.id,
          reason: `Mock Evidence Record for UID: ${uid}`,
        });
      }
    }
  } catch (err) {
    console.warn("Could not audit evidence collection:", err);
  }

  console.log(`\nAudit Complete. Found ${candidateDocs.length} mock/demo document(s).\n`);

  if (candidateDocs.length === 0) {
    console.log("✅ Database is clean! No mock or demo documents detected.");
    return;
  }

  candidateDocs.forEach((item, index) => {
    console.log(` [${index + 1}] ${item.collection}/${item.id} -> ${item.reason}`);
  });

  if (!isExecuteMode) {
    console.log(`\n🔒 Dry-run complete. No data was deleted.`);
    console.log(`To delete these documents, re-run with:`);
    console.log(`   npx tsx scripts/purge-demo-data.ts --execute\n`);
    return;
  }

  // Execute deletion
  console.log(`\nExecuting batch deletion of ${candidateDocs.length} document(s)...`);
  const batch = db.batch();
  for (const item of candidateDocs) {
    const ref = db.collection(item.collection).doc(item.id);
    batch.delete(ref);
  }

  await batch.commit();
  console.log(`✅ Successfully deleted ${candidateDocs.length} mock/demo document(s) from Firestore.\n`);
}

purgeDemoData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error running purge script:", err);
    process.exit(1);
  });
