import { promises as fs } from "node:fs";
import path from "node:path";
import { adminBucket } from "@/lib/firebase/admin";

/**
 * Where library files live. On the self-hosted server they go on a disk volume (LIBRARY_DIR, default /data/library: mount a persistent
 * volume there in Coolify, or files are lost on redeploy). If no writable volume exists, a Cloud Storage bucket is used when the
 * project has one. Files are never put in Firestore: they are too large.
 */
const dir = () => process.env.LIBRARY_DIR || "/data/library";
const safe = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "");

let driver: Promise<"disk" | "bucket" | "none"> | null = null;
function pick(): Promise<"disk" | "bucket" | "none"> {
  if (!driver) {
    driver = (async () => {
      try {
        await fs.mkdir(dir(), { recursive: true });
        await fs.access(dir(), (await import("node:fs")).constants.W_OK);
        return "disk" as const;
      } catch {
        try {
          const [exists] = await adminBucket().exists();
          return exists ? ("bucket" as const) : ("none" as const);
        } catch {
          return "none" as const;
        }
      }
    })();
  }
  return driver;
}

export async function storageReady(): Promise<boolean> {
  return (await pick()) !== "none";
}

export async function putFile(id: string, bytes: Buffer, contentType: string): Promise<"disk" | "bucket"> {
  const d = await pick();
  if (d === "disk") {
    await fs.writeFile(path.join(dir(), safe(id)), bytes);
    return "disk";
  }
  if (d === "bucket") {
    await adminBucket().file(`library/${safe(id)}`).save(bytes, { contentType, resumable: false });
    return "bucket";
  }
  throw Object.assign(new Error("File storage is not set up yet."), { status: 503, code: "STORAGE_UNAVAILABLE" });
}

export async function getFile(id: string, where: "disk" | "bucket"): Promise<Buffer | null> {
  try {
    if (where === "disk") return await fs.readFile(path.join(dir(), safe(id)));
    const [buf] = await adminBucket().file(`library/${safe(id)}`).download();
    return buf;
  } catch {
    return null;
  }
}

export async function deleteFile(id: string, where: "disk" | "bucket"): Promise<void> {
  try {
    if (where === "disk") await fs.unlink(path.join(dir(), safe(id)));
    else await adminBucket().file(`library/${safe(id)}`).delete();
  } catch {
    /* already gone */
  }
}
