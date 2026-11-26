import { adminDb, Timestamp } from "@/lib/firebase/admin";
import type { FileKind } from "./classify";

export const FILES = () => adminDb().collection("libraryFiles");
export const deptKey = (d: string) => d.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface LibraryDoc {
  id: string;
  title: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  pages: number | null;
  kind: FileKind;
  level: number | null;
  courseCode: string | null;
  readPolicy: "full" | "index_only";
  confidence: number;
  institutionId: string | null;
  institution: string;
  department: string;
  deptKey: string;
  uploaderUid: string;
  uploaderName: string;
  where: "disk" | "bucket";
  status: "ready";
  createdAt: unknown;
}

/** What the browser is told about a file (never where it is stored). */
export function publicFile(d: Record<string, unknown>) {
  const c = d.createdAt as { toDate?: () => Date } | undefined;
  return {
    id: String(d.id),
    title: String(d.title || d.fileName || "File"),
    fileName: String(d.fileName || ""),
    sizeBytes: Number(d.sizeBytes) || 0,
    pages: typeof d.pages === "number" ? d.pages : null,
    kind: String(d.kind || "other"),
    level: typeof d.level === "number" ? d.level : null,
    courseCode: typeof d.courseCode === "string" ? d.courseCode : null,
    readPolicy: d.readPolicy === "index_only" ? "index_only" : "full",
    department: String(d.department || ""),
    uploaderName: String(d.uploaderName || ""),
    chapters: Array.isArray(d.chapters) ? d.chapters : [],
    createdAt: c?.toDate?.().toISOString?.() || "",
  };
}

export { Timestamp };
