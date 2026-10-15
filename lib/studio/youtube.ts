import { createHash } from "crypto";
import { adminDb, Timestamp } from "@/lib/firebase/admin";

/**
 * Real YouTube videos for a learning step via the official YouTube Data API (search.list costs
 * 100 of the free 10,000 daily units, so results are cached in Firestore for 30 days and shared by
 * everyone). Without YOUTUBE_API_KEY we return a plain YouTube search link instead.
 */
export interface Video {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
}

const TTL_MS = 30 * 86_400_000;

export function youtubeSearchUrl(q: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export async function findVideos(query: string): Promise<{ videos: Video[]; searchUrl: string; configured: boolean }> {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
  const searchUrl = youtubeSearchUrl(q);
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !q) return { videos: [], searchUrl, configured: !!key };
  const ref = adminDb().collection("videoCache").doc(createHash("sha1").update(q).digest("hex"));
  const cached = await ref.get().catch(() => null);
  if (cached?.exists && Date.now() - (cached.data()!.createdAt?.toMillis?.() || 0) < TTL_MS) {
    return { videos: cached.data()!.videos as Video[], searchUrl, configured: true };
  }
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "strict",
    relevanceLanguage: "en",
    videoDuration: "medium",
    maxResults: "6",
    q: `${q} tutorial`,
    key,
  }).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { videos: [], searchUrl, configured: true };
    const json = (await res.json()) as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; channelId?: string; thumbnails?: { medium?: { url?: string } } } }> };
    const videos: Video[] = (json.items || [])
      .filter((i) => i.id?.videoId)
      .map((i) => ({
        id: i.id!.videoId!,
        title: decode(i.snippet?.title || ""),
        channel: decode(i.snippet?.channelTitle || ""),
        channelId: i.snippet?.channelId || "",
        thumbnail: i.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${i.id!.videoId}/mqdefault.jpg`,
      }));
    await ref.set({ q, videos, createdAt: Timestamp.now() }).catch(() => null);
    return { videos, searchUrl, configured: true };
  } catch {
    return { videos: [], searchUrl, configured: true };
  }
}
