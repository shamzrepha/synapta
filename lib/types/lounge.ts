export type MasteryBand = "strong" | "solid" | "building";

/** A classmate in a class the caller is enrolled in: name, username and a coarse band only. No email, XP or exact score. */
export interface PeerMatch {
  uid: string;
  displayName: string;
  username?: string;
  band: MasteryBand;
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
