import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { ingestDocument, MAX_TEXT_CHARS } from "@/lib/worlds/ingest";
import { describeMaterial, splitLibraryText, type LibraryMaterialRow } from "@/lib/worlds/library";
import { col, loadDocPages } from "@/lib/worlds/store";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_PER_CALL = 12;

const materialsOf = (classId: string) => adminDb().collection("classes").doc(classId).collection("materials");

/** The note already made from a library material for this person, if any. */
async function existingDocs(uid: string, classId: string): Promise<Map<string, string>> {
  const snap = await col.sourceDocs().where("ownerUid", "==", uid).where("classId", "==", classId).limit(200).get();
  const out = new Map<string, string>();
  snap.forEach((d) => {
    const m = d.data().materialId;
    if (typeof m === "string" && m) out.set(m, d.id);
  });
  return out;
}

/** The class's subject library, as a list to pick from. The notes are already there: nobody uploads them again. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req, ["teacher", "admin"]);
    const classId = req.nextUrl.searchParams.get("classId") || "";
    if (!classId) throw new ApiError(400, "VALIDATION", "Missing class.");
    await assertClassAccess(user, classId, "mutate");
    const [snap, have] = await Promise.all([materialsOf(classId).orderBy("createdAt", "desc").limit(60).get(), existingDocs(user.uid, classId)]);
    const rows: LibraryMaterialRow[] = snap.docs.map((d) => describeMaterial(d.id, d.data(), have.get(d.id) ?? null));
    return NextResponse.json({ ok: true, data: { materials: rows } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const body = z.object({
  classId: z.string().min(1).max(128),
  materialIds: z.array(z.string().min(1).max(128)).min(1).max(MAX_PER_CALL),
});

/**
 * Turns library materials into notes for a world (cleaned, unclear lines flagged), the same as an upload would, but from the text
 * the library already holds. A material that was already turned into a note is reused, so nothing is read or paid for twice.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req, ["teacher", "admin"]);
    const limited = await checkRateLimit(req, { uid: user.uid, keyPrefix: "worlds-from-library", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const b = await parseJson(req, body);
    await assertClassAccess(user, b.classId, "mutate");

    const have = await existingDocs(user.uid, b.classId);
    const docs: Array<{ materialId: string; docId: string; title: string; pageCount: number; flagged: Array<{ pageNo: number; lineNo: number; text: string; reason: string }>; reused: boolean }> = [];
    const skipped: Array<{ materialId: string; title: string; reason: string }> = [];

    for (const materialId of [...new Set(b.materialIds)]) {
      const snap = await materialsOf(b.classId).doc(materialId).get();
      if (!snap.exists) {
        skipped.push({ materialId, title: "A note", reason: "It is no longer in the library." });
        continue;
      }
      const m = snap.data() || {};
      const row = describeMaterial(materialId, m, have.get(materialId) ?? null);
      if (row.docId) {
        const pages = await loadDocPages(row.docId);
        const flagged = pages.flatMap((p) => p.lines.filter((l) => l.flagged).map((l) => ({ pageNo: p.pageNo, lineNo: l.lineNo, text: l.text, reason: l.flagReason ?? "Please check this line." })));
        docs.push({ materialId, docId: row.docId, title: row.title, pageCount: pages.length, flagged, reused: true });
        continue;
      }
      if (row.problem) {
        skipped.push({ materialId, title: row.title, reason: row.problem });
        continue;
      }
      const pageTexts = splitLibraryText(String(m.extractedText)).map((t) => t.slice(0, MAX_TEXT_CHARS));
      const r = await ingestDocument({ ownerUid: user.uid, classId: b.classId, materialId, title: row.title, kind: /\.pdf$/i.test(row.fileName) ? "pdf" : "text", pageTexts });
      docs.push({ materialId, docId: r.docId, title: row.title, pageCount: r.pageCount, flagged: r.flagged, reused: false });
    }
    if (docs.length === 0) throw new ApiError(400, "NOTHING_TO_READ", skipped[0]?.reason || "None of those notes have readable text.");
    return NextResponse.json({ ok: true, data: { docs, skipped } });
  } catch (error) {
    return handleAuthError(error);
  }
}
