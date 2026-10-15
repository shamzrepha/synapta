import { bomFor, partTypesUsed } from "./bom";
import { parseVideoUrl, type WallItem } from "./wall";
import type { DesignSpec } from "./spec";

const iso = (v: unknown): string => ((v as { toDate?: () => Date })?.toDate ? (v as { toDate: () => Date }).toDate().toISOString() : typeof v === "string" ? v : "");

/** Turns a published design document into a Maker Wall card (null when it is not on the wall). */
export function wallItemFrom(id: string, d: FirebaseFirestore.DocumentData): WallItem | null {
  if (!d.wall || d.visibility !== "public") return null;
  const spec = (d.spec || {}) as Pick<DesignSpec, "circuit">;
  return {
    id,
    title: String(d.title || "Untitled"),
    kind: String(d.kind || "assembly"),
    ownerName: String(d.ownerName || "Maker"),
    description: String(d.wall.description || ""),
    video: parseVideoUrl(d.wall.videoUrl),
    coverUrl: d.wall.coverPath ? `/api/media/${d.wall.coverPath}` : null,
    starCount: d.starCount || 0,
    forkCount: d.forkCount || 0,
    publishedAt: iso(d.wall.publishedAt) || iso(d.updatedAt),
    partTypes: partTypesUsed(spec),
    total: bomFor(spec).total,
  };
}
