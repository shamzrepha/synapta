export interface PeerMatch {
  uid: string;
  displayName: string;
  email: string;
  xp: number;
  streakDays: number;
  pL: number;
  masteryPercentage: number;
  isMastered: boolean;
  matchReason: string;
}

export interface RoomSummary {
  roomCode: string;
  title: string;
  classId?: string;
  className?: string;
  kcId?: string | null;
  kcTitle?: string | null;
  hostId: string;
  hostName?: string;
  participantCount: number;
  isMember: boolean;
  memberCount?: number;
  activeLearnersCount?: number;
  memberIds?: string[];
  createdAt?: string;
  updatedAt?: string | null;
}

export interface ClassOption {
  id: string;
  title: string;
  subject?: string;
}
