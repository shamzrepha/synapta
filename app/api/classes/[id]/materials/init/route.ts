import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, adminBucket, Timestamp } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB max direct storage upload

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    const body = await req.json().catch(() => ({}));
    const { fileName, mime, sizeBytes, title } = body;

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "fileName is required" } },
        { status: 400 }
      );
    }

    const detectedMime = mime || "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.has(detectedMime) && !fileName.match(/\.(pdf|docx|pptx|txt|md|csv|png|jpg|jpeg|webp)$/i)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: "Unsupported file type. Please upload a PDF, DOCX, PPTX, TXT, MD, or image document.",
          },
        },
        { status: 415 }
      );
    }

    const fileSize = typeof sizeBytes === "number" ? sizeBytes : 0;
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "File exceeds the 100 MB maximum upload limit.",
          },
        },
        { status: 413 }
      );
    }

    const materialRef = adminDb()
      .collection("classes")
      .doc(id)
      .collection("materials")
      .doc();

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `classMaterials/${id}/${materialRef.id}/${safeName}`;

    let uploadUrl = "";
    try {
      const bucket = adminBucket();
      const file = bucket.file(storagePath);
      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 20 * 60 * 1000, // 20 minutes
        contentType: detectedMime,
      });
      uploadUrl = signedUrl;
    } catch (urlErr) {
      console.warn("[materials/init] Could not generate signed upload URL:", urlErr);
    }

    const cleanTitle = (title || fileName.replace(/\.[^/.]+$/, "")).trim();

    const materialDoc = {
      id: materialRef.id,
      classId: id,
      title: cleanTitle,
      fileName,
      safeFileName: safeName,
      mime: detectedMime,
      sizeBytes: fileSize,
      storagePath,
      status: "uploading",
      uploadedBy: caller.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await materialRef.set(materialDoc);

    return NextResponse.json({
      ok: true,
      data: {
        materialId: materialRef.id,
        storagePath,
        uploadUrl,
        method: "PUT",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
