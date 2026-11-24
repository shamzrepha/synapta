import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { notifyMany } from "@/lib/notifications/server";

export const runtime = "nodejs";

const body = z.object({
  kind: z.enum(["idea", "bug", "praise", "other"]),
  message: z.string().trim().min(5, "Tell us a little more").max(2000),
  page: z.string().trim().max(200).optional(),
});

const KIND_LABEL: Record<string, string> = { idea: "idea", bug: "bug", praise: "kind word", other: "message" };

/** Anyone signed in can send the team an idea, a bug, or a kind word. Every one reaches the admins as a notification. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "feedback", limit: 8, windowMs: 60 * 60 * 1000, shared: true });
    if (limited) return limited;
    const b = await parseJson(req, body);
    const u = (await adminDb().collection("users").doc(caller.uid).get()).data() || {};
    const name = String(u.displayName || u.username || "A student");
    const ref = adminDb().collection("feedback").doc();
    await ref.set({
      id: ref.id,
      uid: caller.uid,
      name,
      email: caller.email || "",
      institution: String(u.institution || ""),
      department: String(u.department || ""),
      kind: b.kind,
      message: b.message,
      page: b.page || "",
      status: "new",
      createdAt: Timestamp.now(),
    });
    // every message reaches the admins as a notification
    const admins = await adminDb().collection("users").where("role", "==", "admin").limit(20).get();
    await notifyMany(admins.docs.map((d) => d.id), {
      type: "system",
      title: `New ${KIND_LABEL[b.kind]} from ${name}`,
      body: b.message.slice(0, 140),
      href: "/admin/feedback",
    });
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** What this person has sent, with what happened to it and any reward. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("feedback").where("uid", "==", caller.uid).limit(50).get();
    const items = snap.docs
      .map((d) => {
        const x = d.data();
        return { id: d.id, kind: x.kind, message: x.message, status: x.status, note: x.note || "", reward: x.reward || null, createdAt: x.createdAt?.toDate?.().toISOString?.() || "" };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ ok: true, data: { items } });
  } catch (error) {
    return handleAuthError(error);
  }
}
