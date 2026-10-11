import { Timestamp } from "@/lib/firebase/admin";
import { Card as FsrsCard } from "@/lib/fsrs/scheduler";

export type CardType = "basic" | "cloze" | "multiple_choice";

export interface Flashcard {
  id: string;
  deckId: string;
  ownerId: string;
  type: CardType;
  front: string;
  back: string;
  explanation?: string;
  options?: string[]; // for multiple_choice
  sourceRef?: {
    srcId?: string;
    sourceTitle?: string;
    page?: number;
  };
  kcId?: string;
  classId?: string;
  tags?: string[];
  fsrs?: FsrsCard;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

export interface FlashcardDeck {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  sourceRef?: {
    notebookId?: string;
    classId?: string;
    topicId?: string;
  };
  cardCount: number;
  dueTodayCount?: number;
  tags?: string[];
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}
