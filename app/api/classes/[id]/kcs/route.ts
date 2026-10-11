import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const createKcSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(5),
  lessonMarkdown: z.string().min(10),
  objectives: z.array(z.string()).default([]),
  prerequisiteIds: z.array(z.string()).default([]),
  bkt: z.object({
    pL0: z.number().min(0.01).max(0.99).default(0.2),
    pT: z.number().min(0.01).max(0.99).default(0.15),
    pG: z.number().min(0.01).max(0.99).default(0.2),
    pS: z.number().min(0.01).max(0.99).default(0.1),
  }).default({ pL0: 0.2, pT: 0.15, pG: 0.2, pS: 0.1 }),
  lab: z.object({
    type: z.enum(["ohms_law", "rc_filter", "logic_gates", "projectile", "none"]).default("none"),
    config: z.record(z.union([z.string(), z.number()])).default({}),
  }).default({ type: "none", config: {} }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);

    await assertClassAccess(caller, id, "mutate");
    const classRef = adminDb().collection("classes").doc(id);

    const body = await req.json();
    const parsed = createKcSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }

    const existingKcs = await classRef.collection("kcs").get();
    const newOrder = existingKcs.size + 1;

    const kcRef = classRef.collection("kcs").doc();
    const newKc = {
      id: kcRef.id,
      order: newOrder,
      ...parsed.data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await kcRef.set(newKc);

    return NextResponse.json({
      ok: true,
      data: { kc: newKc },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
