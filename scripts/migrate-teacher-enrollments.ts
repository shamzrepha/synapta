import { adminDb } from "../lib/firebase/admin";

/**
 * Migration Script: Migrate Teacher Enrollments & Recalculate Student Counts
 *
 * Usage:
 *   npx tsx scripts/migrate-teacher-enrollments.ts           # Dry-run audit mode
 *   npx tsx scripts/migrate-teacher-enrollments.ts --apply   # Apply changes to Firestore
 */

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");

  console.log("=======================================================");
  console.log(" Synapta Teacher Enrollment Migration Script");
  console.log(` Mode: ${isApply ? "⚠️  APPLYING CHANGES TO FIRESTORE" : "🔍 DRY RUN (Audit Only)"}`);
  console.log("=======================================================\n");

  const db = adminDb();

  // 1. Audit classes: ensure coTeacherIds is present
  const classesSnap = await db.collection("classes").get();
  console.log(`Found ${classesSnap.size} total classes.`);

  let updatedClassesCount = 0;
  for (const cDoc of classesSnap.docs) {
    const data = cDoc.data();
    const needsCoTeachers = !Array.isArray(data.coTeacherIds);
    const teacherId = data.teacherId;

    // Count real active student enrollments for this class
    const enrollmentsSnap = await db
      .collection("enrollments")
      .where("classId", "==", cDoc.id)
      .get();

    let studentCount = 0;
    const teacherEnrollmentDocIds: string[] = [];

    for (const eDoc of enrollmentsSnap.docs) {
      const eData = eDoc.data();
      if (eData.role === "teacher" || eData.uid === teacherId) {
        teacherEnrollmentDocIds.push(eDoc.id);
      } else if (eData.status === "active") {
        studentCount++;
      }
    }

    const currentStudentCount = data.studentCount ?? 0;
    const countMismatch = currentStudentCount !== studentCount;

    if (needsCoTeachers || countMismatch) {
      console.log(`Class [${cDoc.id}] "${data.title}":`);
      if (needsCoTeachers) console.log("  - Setting coTeacherIds: []");
      if (countMismatch) console.log(`  - Updating studentCount: ${currentStudentCount} -> ${studentCount}`);

      if (isApply) {
        await cDoc.ref.update({
          ...(needsCoTeachers ? { coTeacherIds: [] } : {}),
          studentCount,
        });
      }
      updatedClassesCount++;
    }

    // Delete teacher enrollment docs
    if (teacherEnrollmentDocIds.length > 0) {
      console.log(`  - Found ${teacherEnrollmentDocIds.length} legacy teacher enrollment docs to delete: ${teacherEnrollmentDocIds.join(", ")}`);
      if (isApply) {
        for (const docId of teacherEnrollmentDocIds) {
          await db.collection("enrollments").doc(docId).delete();
        }
      }
    }
  }

  console.log("\n=======================================================");
  console.log(`Migration Complete.`);
  console.log(`Classes examined: ${classesSnap.size}`);
  console.log(`Classes needing updates: ${updatedClassesCount}`);
  if (!isApply) {
    console.log(`No writes were performed. Run with --apply to commit changes.`);
  }
  console.log("=======================================================");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
