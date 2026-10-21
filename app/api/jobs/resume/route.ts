import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError } from "@/lib/api/errors";
import { z } from "zod";
import { buildClassWithAi } from "@/lib/teacher/classBuilder";
import { analyzeMaterialAndRoute } from "@/lib/teacher/materialRouter";

export const runtime = "nodejs";
export const maxDuration = 60;

const idPart = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const resumeSchema = z.object({
  classId: idPart.optional(),
  jobId: idPart.optional(),
  jobType: z.enum(["material", "build"]).optional(),
});

/**
 * Resumes AI jobs that were paused for quota. A teacher can only resume jobs in classes they own or co-teach
 * (admins: any class), and a build job only runs for the person who started it, because it is charged to them.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const raw = await req.json().catch(() => ({}));
    const parsedBody = resumeSchema.safeParse(raw ?? {});
    if (!parsedBody.success) throw new ApiError(400, "VALIDATION", "Invalid request.");
    const { classId, jobId, jobType } = parsedBody.data;
    const isAdmin = caller.role === "admin";
    const mayRunBuild = (input: { userId?: string } | undefined) => isAdmin || input?.userId === caller.uid;

    const results: Array<{ id: string; type: string; status: string; error?: string }> = [];

    // Mode 1: Targeted single-job resumption (e.g. teacher clicked "Resume now")
    if (classId && jobId) {
      await assertClassAccess(caller, classId, "mutate");
      if (jobType === "material") {
        const jobRef = adminDb()
          .collection("classes")
          .doc(classId)
          .collection("materialJobs")
          .doc(jobId);

        const snap = await jobRef.get();
        if (snap.exists) {
          const data = snap.data() || {};
          try {
            await jobRef.update({ status: "running", updatedAt: Timestamp.now() });
            const proposal = await analyzeMaterialAndRoute({
              classId,
              materialId: jobId,
              materialTitle: data.title || "Uploaded Material",
              extractedText: data.extractedText || "",
              userId: caller.uid,
            });

            await jobRef.update({
              status: "completed",
              proposalId: proposal.id,
              updatedAt: Timestamp.now(),
            });

            await adminDb()
              .collection("classes")
              .doc(classId)
              .collection("materials")
              .doc(jobId)
              .update({
                status: "analyzed",
                proposalId: proposal.id,
                updatedAt: Timestamp.now(),
              });

            results.push({ id: jobId, type: "material", status: "completed" });
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            await jobRef.update({ status: "waiting_quota", error: errorMsg, updatedAt: Timestamp.now() });
            results.push({ id: jobId, type: "material", status: "waiting_quota", error: errorMsg });
          }
        }
      } else {
        // Build job
        const jobRef = adminDb()
          .collection("classes")
          .doc(classId)
          .collection("buildJobs")
          .doc(jobId);

        const snap = await jobRef.get();
        if (snap.exists) {
          const data = snap.data() || {};
          if (data.input && !mayRunBuild(data.input)) {
            throw new ApiError(403, "FORBIDDEN", "Only the teacher who started this build can resume it.");
          }
          if (data.input) {
            try {
              const res = await buildClassWithAi(data.input);
              results.push({ id: jobId, type: "build", status: res.status });
            } catch (err: unknown) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              results.push({ id: jobId, type: "build", status: "error", error: errorMsg });
            }
          }
        }
      }

      return NextResponse.json({ ok: true, data: { resumed: results.length, results } });
    }

    // Mode 2: Batch scan across classes for jobs past their quota reset
    const nowMs = Date.now();
    // only the caller's own classes (admins: every class), never other teachers' jobs
    const classesSnap = isAdmin
      ? await adminDb().collection("classes").get()
      : await adminDb().collection("classes").where("teacherId", "==", caller.uid).get();

    for (const classDoc of classesSnap.docs) {
      const cId = classDoc.id;

      // Check buildJobs
      const buildSnap = await adminDb()
        .collection("classes")
        .doc(cId)
        .collection("buildJobs")
        .where("status", "==", "waiting_quota")
        .get();

      for (const bDoc of buildSnap.docs) {
        const d = bDoc.data();
        if (!d.resumeTimestampMs || nowMs >= d.resumeTimestampMs) {
          if (d.input && mayRunBuild(d.input)) {
            try {
              const res = await buildClassWithAi(d.input);
              results.push({ id: bDoc.id, type: "build", status: res.status });
            } catch (err: unknown) {
              results.push({ id: bDoc.id, type: "build", status: "error", error: String(err) });
            }
          }
        }
      }

      // Check materialJobs
      const matSnap = await adminDb()
        .collection("classes")
        .doc(cId)
        .collection("materialJobs")
        .where("status", "==", "waiting_quota")
        .get();

      for (const mDoc of matSnap.docs) {
        const d = mDoc.data();
        if (!d.resumeTimestampMs || nowMs >= d.resumeTimestampMs) {
          try {
            const proposal = await analyzeMaterialAndRoute({
              classId: cId,
              materialId: mDoc.id,
              materialTitle: d.title || "Material",
              extractedText: d.extractedText || "",
              userId: caller.uid,
            });
            await mDoc.ref.update({ status: "completed", proposalId: proposal.id, updatedAt: Timestamp.now() });
            results.push({ id: mDoc.id, type: "material", status: "completed" });
          } catch (err: unknown) {
            results.push({ id: mDoc.id, type: "material", status: "waiting_quota", error: String(err) });
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        resumed: results.length,
        results,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
