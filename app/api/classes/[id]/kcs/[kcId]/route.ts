import { publishMapOf } from "@/lib/classes/published";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const updateKcSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().min(5).optional(),
  lessonMarkdown: z.string().min(10).optional(),
  objectives: z.array(z.string()).optional(),
  prerequisiteIds: z.array(z.string()).optional(),
  bkt: z.object({
    pL0: z.number().min(0.01).max(0.99),
    pT: z.number().min(0.01).max(0.99),
    pG: z.number().min(0.01).max(0.99),
    pS: z.number().min(0.01).max(0.99),
  }).optional(),
  lab: z.object({
    type: z.enum(["ohms_law", "rc_filter", "logic_gates", "projectile", "none"]),
    config: z.record(z.union([z.string(), z.number()])).optional(),
  }).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kcId: string }> }
) {
  try {
    const { id, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, id, "view");

    const kcRef = adminDb().collection("classes").doc(id).collection("kcs").doc(kcId);
    const kcDoc = await kcRef.get();
    if (!kcDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Knowledge Component not found" } },
        { status: 404 }
      );
    }

    const data = kcDoc.data()!;
    const published = publishMapOf(data);
    if (access.canMutate) return NextResponse.json({ ok: true, data: { id: kcDoc.id, ...data, published } });
    // Students only get what the teacher published
    const { contentPublished: _omit, labs, ...rest } = data;
    void _omit;
    return NextResponse.json({
      ok: true,
      data: {
        id: kcDoc.id,
        ...rest,
        labs: Array.isArray(labs) ? labs.filter((l: { published?: boolean }) => l.published !== false) : labs,
        published,
        ...(published.lesson ? {} : { lessonMarkdown: "" }),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kcId: string }> }
) {
  try {
    const { id, kcId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);

    await assertClassAccess(caller, id, "mutate");
    const classRef = adminDb().collection("classes").doc(id);

    const body = await req.json();
    const parsed = updateKcSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }

    const kcRef = classRef.collection("kcs").doc(kcId);
    const kcDoc = await kcRef.get();
    if (!kcDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "KC not found" } },
        { status: 404 }
      );
    }

    const updatePayload = {
      ...parsed.data,
      updatedAt: Timestamp.now(),
    };

    await kcRef.update(updatePayload);

    return NextResponse.json({
      ok: true,
      data: { status: "updated", kc: { ...kcDoc.data(), ...updatePayload } },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kcId: string }> }
) {
  try {
    const { id, kcId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);

    await assertClassAccess(caller, id, "mutate");
    const classRef = adminDb().collection("classes").doc(id);

    const kcRef = classRef.collection("kcs").doc(kcId);
    await kcRef.delete();

    return NextResponse.json({
      ok: true,
      data: { status: "deleted", kcId },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
