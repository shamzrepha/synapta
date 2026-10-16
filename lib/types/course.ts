import { BktParameters } from "@/lib/bkt/engine";

export interface KnowledgeComponent {
  id: string;
  classId: string;
  title: string;
  slug: string;
  description: string;
  week?: number;
  objectives: string[];
  prerequisiteIds: string[];
  bkt: Required<BktParameters>;
  difficulty?: "introductory" | "intermediate" | "advanced";
  status: "draft" | "published";
  sourceMaterialIds?: string[];
  /** which generated content students can see; absent on older topics (= all published) */
  contentPublished?: Record<"lesson" | "audio" | "simulation" | "practice", boolean>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LessonDoc {
  id: string;
  classId: string;
  kcId: string;
  title: string;
  status: "draft" | "approved" | "rejected";
  markdown: string;
  citations?: {
    sourceId: string;
    title: string;
    page?: number;
    textSnippet?: string;
  }[];
  readingTimeMinutes?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MaterialDoc {
  id: string;
  classId: string;
  title: string;
  type: "pdf" | "text" | "outline";
  storagePath?: string;
  downloadUrl?: string;
  pageCount?: number;
  status: "uploaded" | "processing" | "indexed" | "failed";
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AssignmentDoc {
  id: string;
  classId: string;
  kcId?: string;
  title: string;
  type: "quiz" | "lab" | "peer_explain" | "transfer_test";
  status: "draft" | "published";
  description?: string;
  maxScore?: number;
  dueDate?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClassDoc {
  id: string;
  title: string;
  subject: string;
  description: string;
  level: "school" | "undergrad" | "professional";
  audienceTags: string[];
  durationWeeks: number;
  teacherId: string;
  coTeacherIds: string[];
  teacherName: string;
  visibility: "public" | "private";
  status: "draft" | "published";
  buildState: "empty" | "drafting" | "ready" | "failed";
  joinCode: string;
  studentCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}
