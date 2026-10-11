import { Timestamp } from "@/lib/firebase/admin";

export interface LessonSection {
  title: string;
  markdown: string;
}

export interface CheckQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface StructuredLessonContent {
  kcId: string;
  classId: string;
  title: string;
  overview: string;
  keyIdeas: string[];
  detailedNotes: string;
  workedExamples?: Array<{
    title: string;
    problem: string;
    solutionSteps: string[];
  }>;
  keyTerms?: Array<{
    term: string;
    definition: string;
  }>;
  commonMistakes?: string[];
  summary: string;
  checkQuestions: CheckQuestion[];
  readingTimeMinutes: number;
  sources?: Array<{
    docTitle: string;
    pageRange?: string;
  }>;
  updatedAt: Timestamp | string;
}

export interface UserTopicNote {
  id: string;
  userId: string;
  classId: string;
  kcId: string;
  contentMarkdown: string;
  highlights: Array<{
    text: string;
    color: string;
    createdAt: Timestamp | string;
  }>;
  updatedAt: Timestamp | string;
}
