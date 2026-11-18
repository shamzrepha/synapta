import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const inquirySchema = z.object({
  institution: z.string().trim().min(2).max(140),
  department: z.string().trim().min(2).max(140),
  contactRole: z.enum(["hod_dean", "lecturer", "school_admin", "class_rep"]).default("hod_dean"),
  estimatedStudents: z.number().int().min(10).max(50_000).default(150),
  contactName: z.string().trim().min(2).max(100),
  contactEmail: z.string().trim().email().max(140),
  contactPhone: z.string().trim().min(5).max(40),
  notes: z.string().trim().max(800).optional().default(""),
});

/**
 * B2B University, Faculty & Departmental Licensing Pipeline.
 * Allows Deans, HODs, Lecturers, School Admins, and Student Union / Class Reps
 * to request a departmental pilot or semester invoice (₦1,200 / student / semester).
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, {
      uid: caller.uid,
      keyPrefix: "institution_inquiry",
      limit: 5,
      windowMs: 3_600_000,
      shared: true, // counted across all server instances: each request writes a record the sales team has to read
    });
    if (limited) return limited;

    const body = await parseJson(req, inquirySchema);
    const seats = body.estimatedStudents ?? 150;
    const estimatedSemesterNgn = seats * 1200;

    const ref = adminDb().collection("institutionInquiries").doc();
    const record = {
      id: ref.id,
      uid: caller.uid,
      institution: body.institution,
      department: body.department,
      contactRole: body.contactRole ?? "hod_dean",
      estimatedStudents: seats,
      estimatedSemesterNgn,
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      notes: body.notes || "",
      status: "new",
      createdAt: Timestamp.now(),
    };

    await ref.set(record);

    return NextResponse.json({
      ok: true,
      data: {
        id: ref.id,
        estimatedSemesterNgn,
        message: "Departmental pilot & quote request received.",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
