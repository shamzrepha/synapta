import { Timestamp } from "@/lib/firebase/admin";

export type SourceType =
  | "pdf"
  | "docx"
  | "pptx"
  | "txt"
  | "md"
  | "image"
  | "audio"
  | "video"
  | "url"
  | "youtube"
  | "paste"
  | "classMaterial";

export interface SourceDocument {
  id: string;
  ownerId: string;
  type: SourceType;
  title: string;
  status: "processing" | "ready" | "failed";
  storagePath?: string;
  url?: string;
  pageCount?: number;
  chapters?: Array<{ title: string; page?: number }>;
  summary?: string;
  topics?: string[];
  contentHash?: string;
  extractedTextRef?: string;
  language?: string;
  createdAt: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface Notebook {
  id: string;
  ownerId: string;
  title: string;
  emoji?: string;
  description?: string;
  sourceIds: string[];
  classId?: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

export interface CitationReference {
  srcId: string;
  sourceTitle: string;
  page?: number;
  quote?: string;
  chunkId?: string;
}

export interface NotebookMessage {
  id: string;
  role: "user" | "model" | "assistant";
  text: string;
  citations?: CitationReference[];
  savedAsNoteId?: string;
  createdAt: Timestamp | string;
}

export type StudioOutputType =
  | "mindmap"
  | "study_guide"
  | "briefing"
  | "faq"
  | "timeline"
  | "glossary"
  | "cheatsheet"
  | "audio_overview"
  | "flashcards"
  | "quiz";

export interface StudioOutput {
  id: string;
  notebookId: string;
  type: StudioOutputType;
  title: string;
  content: string; // Markdown or JSON stringified
  status: "generating" | "ready" | "failed";
  modelUsed?: string;
  audioUrl?: string;
  transcript?: Array<{ speaker: string; text: string; startMs?: number; endMs?: number }>;
  sourceIds?: string[];
  createdAt: Timestamp | string;
}
