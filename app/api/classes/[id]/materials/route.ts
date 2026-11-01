import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { analyzeMaterialAndRoute } from "@/lib/teacher/materialRouter";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const materialSchema = z.object({
  title: z.string().trim().min(1).max(200),
  fileName: z.string().max(255).optional(),
  mime: z.string().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().max(200_000_000).optional(),
  contentText: z.string().min(1).max(2_000_000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    const parsed = materialSchema.safeParse(await req.json().catch(() => null));
    const { title, fileName, mime, sizeBytes, contentText } = parsed.success ? parsed.data : ({} as Partial<z.infer<typeof materialSchema>>);

    if (!parsed.success || !title || !contentText) {
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
