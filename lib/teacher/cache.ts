import { adminDb, Timestamp } from "@/lib/firebase/admin";
import crypto from "crypto";

export type ContentKind = "explanation" | "quiz" | "flashcards" | "worked_example";
export type ContentLevel = "beginner" | "standard" | "advanced";

export interface ContentCacheItem {
  hash: string;
  classId: string;
  kcId: string;
  kcTitle?: string;
  kind: ContentKind;
  representation?: string;
  level: ContentLevel;
  content: unknown;
  status: "draft" | "approved" | "rejected";
  version: number;
  qualityReport?: {
    passed: boolean;
    score: number;
    issues: string[];
  };
  cacheHits: number;
  createdBy: string;
  approvedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Computes a deterministic cache key for content deduplication.
 */
export function computeContentHash(
  kcId: string,
  kind: ContentKind,
  representation = "default",
  level: ContentLevel = "standard"
): string {
  const seed = `${kcId}_${kind}_${representation}_${level}`;
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

/**
 * Fetches approved cached content if present, recording a cache hit.
 */
export async function getApprovedCachedContent(
  classId: string,
  kcId: string,
  kind: ContentKind,
  representation = "default",
  level: ContentLevel = "standard"
): Promise<ContentCacheItem | null> {
  const hash = computeContentHash(kcId, kind, representation, level);
  const docRef = adminDb().collection("contentCache").doc(hash);
  const doc = await docRef.get();

  if (doc.exists) {
    const data = doc.data() as ContentCacheItem;
    if (data.status === "approved" && data.classId === classId) {
      // Asynchronously increment cache hit counter
      docRef.update({
        cacheHits: (data.cacheHits || 0) + 1,
        updatedAt: Timestamp.now(),
      }).catch(() => {});
      return data;
    }
  }

  return null;
}
