import crypto from "crypto";
import { adminDb, Timestamp } from "@/lib/firebase/admin";

/**
 * Saves the notes a teacher uploaded in the create-class wizard as a document in the class library
 * (classes/{id}/materials), the same place the Materials uploader writes to. Lessons, the tutor and
 * recommendations read that library, so the teacher never has to upload the same file again.
 * Returns true when the text is in the library (saved now, or already there).
 */
export async function saveSeedAsMaterial(classId: string, text: string | undefined, uploadedBy: string): Promise<boolean> {
  const clean = (text || "").trim();
  if (clean.length < 40) return false;
  try {
    const contentHash = crypto.createHash("sha256").update(clean).digest("hex");
    const col = adminDb().collection("classes").doc(classId).collection("materials");
    const existing = await col.where("contentHash", "==", contentHash).limit(1).get();
    if (!existing.empty) return true;
    const ref = col.doc();
    await ref.set({
      id: ref.id,
      classId,
      title: "Notes uploaded when creating the class",
      fileName: "class-notes.txt",
      mime: "text/plain",
      sizeBytes: clean.length,
      status: "analyzed",
      source: "class_wizard",
      contentHash,
      extractedText: clean.slice(0, 150_000),
      extractedChars: Math.min(clean.length, 150_000),
      uploadedBy,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return true;
  } catch (err) {
    console.warn("[seedMaterial] could not save wizard notes to the library:", err);
    return false;
  }
}
