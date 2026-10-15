import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { findVideos } from "@/lib/studio/youtube";

export const runtime = "nodejs";

/** YouTube videos for a topic/step. `prefer` = a channel id to list first (one consistent creator). */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_videos", limit: 40, windowMs: 60_000 });
    if (limited) return limited;
    const q = req.nextUrl.searchParams.get("q") || "";
    const prefer = req.nextUrl.searchParams.get("prefer") || "";
    const r = await findVideos(q);
    const videos = prefer ? [...r.videos.filter((v) => v.channelId === prefer), ...r.videos.filter((v) => v.channelId !== prefer)] : r.videos;
    return NextResponse.json({ ok: true, data: { ...r, videos } });
  } catch (error) {
    return handleAuthError(error);
  }
}
