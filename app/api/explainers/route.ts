import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { saveMedia } from "@/lib/media/store";
import { checkRateLimit } from "@/lib/rateLimit";
import { getPublicProfiles } from "@/lib/social/profile";
import { MAX_BYTES, normalizeTags, sniffVideo, validateUpload } from "@/lib/explainers/rules";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Newest explainers (optionally one tag, or only mine) with my like state. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const tag = (req.nextUrl.searchParams.get("tag") || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    const mine = req.nextUrl.searchParams.get("mine") === "1";
    const col = adminDb().collection("explainers");

    // One simple query each (no composite index); the rest is filtered/sorted in memory.
    let docs: FirebaseFirestore.QueryDocumentSnapshot[];
    if (mine) docs = (await col.where("ownerUid", "==", caller.uid).limit(100).get()).docs;
    else if (tag) docs = (await col.where("tags", "array-contains", tag).limit(100).get()).docs;
    else docs = (await col.orderBy("createdAtMs", "desc").limit(40).get()).docs;
    docs.sort((a, b) => (b.data().createdAtMs || 0) - (a.data().createdAtMs || 0));
    docs = docs.slice(0, 40);

    const [profiles, likeSnaps] = await Promise.all([
      getPublicProfiles(docs.map((d) => d.data().ownerUid)),
      docs.length ? adminDb().getAll(...docs.map((d) => col.doc(d.id).collection("likes").doc(caller.uid))) : Promise.resolve([]),
    ]);

    const items = docs.map((d, i) => {
      const x = d.data();
      const p = profiles.get(x.ownerUid);
      return {
        id: d.id,
        title: x.title,
        tags: x.tags || [],
        videoUrl: `/api/media/${x.videoPath}`,
        durationSec: x.durationSec,
        likeCount: x.likeCount || 0,
        liked: likeSnaps[i]?.exists || false,
        createdAt: new Date(x.createdAtMs || 0).toISOString(),
        owner: { uid: x.ownerUid, displayName: p?.displayName || "Learner", photoURL: p?.photoURL || null },
        isMine: x.ownerUid === caller.uid,
      };
    });
    return NextResponse.json({ ok: true, data: items });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Multipart upload: file, title, tags, durationSec (measured by the browser; the server re-checks size and type). */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "explainer_upload", limit: 5, windowMs: 10 * 60_000 });
    if (limited) return limited;

    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > MAX_BYTES + 200_000) throw new ApiError(413, "TOO_LARGE", "Video is too large (25 MB max).");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) throw new ApiError(400, "VALIDATION", "Attach a video file.");
    const title = String(form.get("title") || "").trim();
    const durationSec = Number(form.get("durationSec"));
    const bytes = Buffer.from(await file.arrayBuffer());

    const problem = validateUpload({ bytes: bytes.length, durationSec, title });
    if (problem) throw new ApiError(problem.includes("large") ? 413 : 400, problem.includes("large") ? "TOO_LARGE" : "VALIDATION", problem);
    const kind = sniffVideo(bytes);
    if (!kind) throw new ApiError(400, "VALIDATION", "Only MP4, MOV or WebM videos are allowed.");

    const ref = adminDb().collection("explainers").doc();
    const videoPath = `explainers/${caller.uid}/${ref.id}.${kind.ext}`;
    try {
      await saveMedia(videoPath, bytes, kind.type, caller.uid);
    } catch (e) {
      if ((e as { code?: string }).code === "TOO_LARGE") {
        throw new ApiError(413, "TOO_LARGE", "Video storage isn't set up for this project yet (needs Cloud Storage). Ask your admin.");
      }
      throw e;
    }
    const now = Date.now();
    await ref.set({
      ownerUid: caller.uid,
      title: title.slice(0, 100),
      tags: normalizeTags(form.get("tags")),
      videoPath,
      contentType: kind.type,
      bytes: bytes.length,
      durationSec: Math.round(durationSec * 10) / 10,
      likeCount: 0,
      createdAtMs: now,
      createdAt: Timestamp.fromMillis(now),
    });
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
