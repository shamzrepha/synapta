import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, adminBucket, Timestamp } from "@/lib/firebase/admin";
import { ingestMaterialBuffer } from "@/lib/teacher/materialIngest";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const { id, mid } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    const materialRef = adminDb()
      .collection("classes")
      .doc(id)
      .collection("materials")
      .doc(mid);

    const docSnap = await materialRef.get();
    if (!docSnap.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Material record not found" } },
        { status: 404 }
      );
    }

    const materialData = docSnap.data() || {};
    const body = await req.json().catch(() => ({}));

    let buffer: Buffer;

    // Direct text / outline payload support
    if (typeof body.contentText === "string" && body.contentText.trim().length > 0) {
      buffer = Buffer.from(body.contentText, "utf-8");
    } else if (materialData.storagePath) {
      // Download file bytes from Firebase Storage
      const bucket = adminBucket();
      const file = bucket.file(materialData.storagePath);
      const [exists] = await file.exists();

      if (!exists) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "FILE_NOT_FOUND",
              message: "Uploaded file not found in storage. Please retry the upload.",
            },
          },
          { status: 404 }
        );
      }

      const [fileBuffer] = await file.download();
      buffer = fileBuffer;
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "No content or storage path found for this material.",
          },
        },
        { status: 400 }
      );
    }

    // Verify PDF Magic Bytes (%PDF-)
    const isPdf =
      materialData.mime === "application/pdf" ||
      (materialData.fileName && materialData.fileName.toLowerCase().endsWith(".pdf"));

    if (isPdf && buffer.length >= 5) {
      const magic = buffer.toString("utf8", 0, 5);
      if (magic !== "%PDF-") {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "CORRUPTED_PDF",
              message: "Invalid PDF format or corrupted file header.",
            },
          },
          { status: 400 }
        );
      }
    }

    // SHA-256 Deduplication check
    const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const dupSnap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("materials")
      .where("contentHash", "==", contentHash)
      .get();

    const existingDups = dupSnap.docs.filter((d) => d.id !== mid);
    if (existingDups.length > 0) {
      const dupDoc = existingDups[0].data();
      await materialRef.update({
        contentHash,
        status: dupDoc.status || "analyzed",
        proposalId: dupDoc.proposalId || null,
        isDuplicate: true,
        originalMaterialId: existingDups[0].id,
        updatedAt: Timestamp.now(),
      });

      return NextResponse.json({
        ok: true,
        data: {
          materialId: mid,
          contentHash,
          status: "duplicate_skipped",
          message: "Identical material already uploaded and processed in this course.",
          proposalId: dupDoc.proposalId || null,
        },
      });
    }

    // Run Call-Minimizing Ingestion Pipeline
    const ingestResult = await ingestMaterialBuffer({
      classId: id,
      materialId: mid,
      title: materialData.title || "Uploaded Material",
      fileName: materialData.fileName || "material.pdf",
      mime: materialData.mime || "application/pdf",
      buffer,
      userId: caller.uid,
    });

    const updatedSnap = await materialRef.get();

    return NextResponse.json({
      ok: true,
      data: {
        material: { id: mid, ...updatedSnap.data() },
        ingestResult,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
