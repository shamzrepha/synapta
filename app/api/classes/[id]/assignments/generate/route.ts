import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { runMultiAgentAssignmentGenerator } from "@/lib/teacher/assignmentAgent";
import { z } from "zod";

export const runtime = "nodejs";

const generateSchema = z.object({
  kind: z.enum(["theory", "practical"]),
  selectedKcIds: z.array(z.string()).min(1, "Select at least one topic"),
  difficulty: z.enum(["introductory", "intermediate", "advanced", "olympiad"]).default("intermediate"),
  numItems: z.number().min(1).max(10).optional(),
  specialInstructions: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await req.json();
    const parsed = generateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid payload" } },
        { status: 400 }
      );
    }

    const { kind, selectedKcIds, difficulty, numItems, specialInstructions } = parsed.data;

    // Fetch class
    const classDoc = await adminDb().collection("classes").doc(id).get();
    if (!classDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Class not found" } },
        { status: 404 }
      );
    }

    const classData = classDoc.data()!;
    if (classData.teacherId !== caller.uid && caller.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Only class teacher or admin can generate assignments" } },
        { status: 403 }
      );
    }

    // Fetch Knowledge Components
    const kcsSubSnap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("kcs")
      .get();

    let allKcs: Array<{ id: string; title: string }> = [];
    if (!kcsSubSnap.empty) {
      allKcs = kcsSubSnap.docs.map((d) => ({ id: d.id, title: (d.data().title as string) || "Topic" }));
    } else if (Array.isArray(classData.kcs)) {
      allKcs = classData.kcs;
    }

    const selectedKcs = allKcs.filter((k) => selectedKcIds.includes(k.id));
    if (selectedKcs.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "No matching knowledge components found in this class" } },
        { status: 400 }
      );
    }

    // Run multi-agent pipeline
    const assignmentData = await runMultiAgentAssignmentGenerator({
      classTitle: classData.title,
      subject: classData.subject,
      classDescription: classData.description || "",
      kind,
      selectedKcs,
      difficulty,
      numItems,
      specialInstructions,
    });

    const assignmentRef = adminDb()
      .collection("classes")
      .doc(id)
      .collection("assignments")
      .doc();

    const record = {
      ...assignmentData,
      id: assignmentRef.id,
      classId: id,
      teacherId: caller.uid,
      status: "draft",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await assignmentRef.set(record);

    return NextResponse.json({
      ok: true,
      data: {
        assignment: record,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
