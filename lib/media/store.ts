import { adminBucket, adminDb, Timestamp } from "@/lib/firebase/admin";

/**
 * Stores user images. Uses Cloud Storage when the project has a bucket; otherwise (e.g. Spark-plan
 * projects, where a default bucket now needs Blaze) images go into Firestore `media/{id}` docs,
 * which is why uploads are capped below the 1 MiB document limit.
 */
export const FIRESTORE_MEDIA_MAX_BYTES = 700_000;

let bucketAvailable: Promise<boolean> | null = null;

function hasBucket(): Promise<boolean> {
  if (!bucketAvailable) {
    bucketAvailable = adminBucket()
      .exists()
      .then(([exists]) => exists)
      .catch(() => false);
  }
  return bucketAvailable;
}

function mediaDocId(path: string): string {
  return path.replace(/\//g, "__");
}

export async function saveMedia(path: string, bytes: Buffer, contentType: string, ownerUid: string): Promise<void> {
  if (await hasBucket()) {
    try {
      await adminBucket().file(path).save(bytes, { contentType, resumable: false, metadata: { cacheControl: "private, max-age=31536000" } });
      return;
    } catch {
      // fall through to Firestore if the bucket rejects the write
    }
  }
  if (bytes.length > FIRESTORE_MEDIA_MAX_BYTES) {
    throw Object.assign(new Error("Image is too large (max 700 KB after compression)."), { status: 413, code: "TOO_LARGE" });
  }
  await adminDb().collection("media").doc(mediaDocId(path)).set({
    path,
    ownerUid,
    contentType,
    data: bytes.toString("base64"),
    bytes: bytes.length,
    createdAt: Timestamp.now(),
  });
}

export async function loadMedia(path: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const doc = await adminDb().collection("media").doc(mediaDocId(path)).get();
  if (doc.exists) {
    const d = doc.data()!;
    return { bytes: Buffer.from(String(d.data || ""), "base64"), contentType: String(d.contentType || "application/octet-stream") };
  }
  if (!(await hasBucket())) return null;
  const file = adminBucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [[buf], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  return { bytes: buf, contentType: String(meta.contentType || "application/octet-stream") };
}
