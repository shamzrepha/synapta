export interface EventSummary {
  id: string;
  kind: "quiz_sprint" | "hackathon" | "build";
  title: string;
  description: string;
  topic: string;
  hostUid: string;
  hostName: string;
  classId: string | null;
  classTitle: string | null;
  visibility: "public" | "class";
  startAt: string;
  endAt: string;
  votingEndsAt: string | null;
  secondsPerQuestion: number | null;
  questionCount: number | null;
  rewards: { first: number; second: number; third: number; participation: number };
  participantCount: number;
  submissionCount: number;
  status: "upcoming" | "live" | "voting" | "ended";
  finalized: boolean;
  results: Array<{ uid: string; displayName: string; rank: number; score: number }> | null;
  build?: {
    designKind: "mechanism" | "circuit";
    templateId: string;
    loadMass?: number;
    liftHeight?: number;
    input?: { kind: "motor" | "crank"; stallTorque: number; freeRpm: number; crankRadius: number; force: number; crankRpm: number };
    maxStages: number;
  } | null;
}

export interface BoardRow {
  rank: number;
  uid: string;
  displayName: string;
  photoURL: string | null;
  level: number;
  score: number;
  correct: number;
  answered: number;
  finished: boolean;
  title: string | null;
  summary: string | null;
  link: string | null;
  repoLink: string | null;
  submittedAt: string | null;
  verdict?: string | null;
  details?: Record<string, number | string | boolean | null> | null;
  designId?: string | null;
  isMe: boolean;
}

export interface EventDetail {
  event: EventSummary;
  canManage: boolean;
  canParticipate: boolean;
  joined: boolean;
  me: {
    score: number;
    correct: number;
    answered: number;
    streak: number;
    currentIndex: number;
    finished: boolean;
    submission: { title: string; summary: string; link: string; repoLink: string | null } | null;
    designId?: string | null;
    verdict?: string | null;
    submitted?: boolean;
  } | null;
  myVote: string | null;
  board: BoardRow[];
  serverNow: string;
}

export const STATUS_STYLE: Record<EventSummary["status"], { label: string; className: string }> = {
  live: { label: "LIVE", className: "bg-rose-500 text-white animate-pulse" },
  voting: { label: "VOTING", className: "bg-indigo-500 text-white" },
  upcoming: { label: "UPCOMING", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  ended: { label: "ENDED", className: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};
