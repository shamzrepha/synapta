import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { analyzeMaterialAndRoute } from "@/lib/teacher/materialRouter";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    const body = await req.json();
    const { title, fileName, mime, sizeBytes, contentText } = body;

    if (!title || !contentText) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Title and content text are required" } },
        { status: 400 }
      );
    }

    const contentHash = crypto.createHash("sha256").update(contentText).digest("hex");

    const materialRef = adminDb()
      .collection("classes")
      .doc(id)
      .collection("materials")
      .doc();

    const materialDoc = {
      id: materialRef.id,
      title: title.trim(),
      fileName: fileName || `${title.trim()}.txt`,
      mime: mime || "text/plain",
      sizeBytes: sizeBytes || contentText.length,
      contentHash,
      status: "analyzed",
      uploadedBy: caller.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await materialRef.set(materialDoc);

    // Run AI routing analysis
    const proposal = await analyzeMaterialAndRoute({
      classId: id,
      materialId: materialRef.id,
      materialTitle: title,
      extractedText: contentText,
      userId: caller.uid,
    });

    return NextResponse.json({
      ok: true,
      data: {
        material: materialDoc,
        proposal,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "view");

    const snap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("materials")
      .orderBy("createdAt", "desc")
      .get();

    const materials = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({
      ok: true,
      data: materials,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
