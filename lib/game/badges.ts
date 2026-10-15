export interface PlayerStats {
  evidence: number;
  quizCorrect: number;
  quizAnswered: number;
  labs: number;
  flashcards: number;
  masteries: number;
  peerHelps: number;
  posts: number;
  comments: number;
  likesReceived: number;
  eventsJoined: number;
  eventWins: number;
  podiums: number;
  promotions: number;
  sessionsJoined: number;
}

export const EMPTY_STATS: PlayerStats = {
  evidence: 0,
  quizCorrect: 0,
  quizAnswered: 0,
  labs: 0,
  flashcards: 0,
  masteries: 0,
  peerHelps: 0,
  posts: 0,
  comments: 0,
  likesReceived: 0,
  eventsJoined: 0,
  eventWins: 0,
  podiums: 0,
  promotions: 0,
  sessionsJoined: 0,
};

export interface BadgeContext {
  stats: PlayerStats;
  level: number;
  streakDays: number;
  leagueTier: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  emoji: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  test: (c: BadgeContext) => boolean;
}

export const BADGES: BadgeDef[] = [
  { id: "first_steps", name: "First Steps", description: "Record your first learning activity", emoji: "👣", rarity: "common", test: (c) => c.stats.evidence >= 1 },
  { id: "quiz_10", name: "Quiz Whiz", description: "Answer 10 quiz questions correctly", emoji: "🧠", rarity: "common", test: (c) => c.stats.quizCorrect >= 10 },
  { id: "quiz_100", name: "Question Crusher", description: "Answer 100 quiz questions correctly", emoji: "⚡", rarity: "rare", test: (c) => c.stats.quizCorrect >= 100 },
  { id: "quiz_500", name: "Oracle", description: "Answer 500 quiz questions correctly", emoji: "🔮", rarity: "epic", test: (c) => c.stats.quizCorrect >= 500 },
  { id: "lab_1", name: "Lab Rat", description: "Pass your first simulation check", emoji: "🧪", rarity: "common", test: (c) => c.stats.labs >= 1 },
  { id: "lab_10", name: "Mad Scientist", description: "Pass 10 simulation checks", emoji: "🔬", rarity: "rare", test: (c) => c.stats.labs >= 10 },
  { id: "cards_50", name: "Card Shark", description: "Review 50 flashcards", emoji: "🃏", rarity: "common", test: (c) => c.stats.flashcards >= 50 },
  { id: "mastery_1", name: "Mastered!", description: "Master your first topic", emoji: "🏅", rarity: "common", test: (c) => c.stats.masteries >= 1 },
  { id: "mastery_5", name: "Polymath", description: "Master 5 topics", emoji: "📚", rarity: "rare", test: (c) => c.stats.masteries >= 5 },
  { id: "mastery_20", name: "Grandmaster", description: "Master 20 topics", emoji: "👑", rarity: "legendary", test: (c) => c.stats.masteries >= 20 },
  { id: "streak_3", name: "Warming Up", description: "3-day study streak", emoji: "🔥", rarity: "common", test: (c) => c.streakDays >= 3 },
  { id: "streak_7", name: "On Fire", description: "7-day study streak", emoji: "🚀", rarity: "rare", test: (c) => c.streakDays >= 7 },
  { id: "streak_30", name: "Unstoppable", description: "30-day study streak", emoji: "☄️", rarity: "epic", test: (c) => c.streakDays >= 30 },
  { id: "level_5", name: "Rising Star", description: "Reach level 5", emoji: "⭐", rarity: "common", test: (c) => c.level >= 5 },
  { id: "level_10", name: "Adept", description: "Reach level 10", emoji: "🌟", rarity: "rare", test: (c) => c.level >= 10 },
  { id: "level_25", name: "Luminary", description: "Reach level 25", emoji: "✨", rarity: "epic", test: (c) => c.level >= 25 },
  { id: "promoted", name: "Climber", description: "Get promoted in the weekly league", emoji: "🧗", rarity: "common", test: (c) => c.stats.promotions >= 1 },
  { id: "league_gold", name: "Golden", description: "Reach the Gold league", emoji: "🥇", rarity: "rare", test: (c) => c.leagueTier >= 2 },
  { id: "league_diamond", name: "Diamond Mind", description: "Reach the Diamond league", emoji: "💎", rarity: "legendary", test: (c) => c.leagueTier >= 9 },
  { id: "peer_mentor", name: "Peer Mentor", description: "Help a classmate in a study room", emoji: "🤝", rarity: "rare", test: (c) => c.stats.peerHelps >= 1 },
  { id: "first_post", name: "Hello World", description: "Share your first post", emoji: "📣", rarity: "common", test: (c) => c.stats.posts >= 1 },
  { id: "popular", name: "Crowd Favourite", description: "Receive 25 likes", emoji: "❤️", rarity: "rare", test: (c) => c.stats.likesReceived >= 25 },
  { id: "helper", name: "Helping Hand", description: "Write 10 comments", emoji: "💬", rarity: "common", test: (c) => c.stats.comments >= 10 },
  { id: "challenger", name: "Challenger", description: "Join a challenge or hackathon", emoji: "🎯", rarity: "common", test: (c) => c.stats.eventsJoined >= 1 },
  { id: "podium", name: "On the Podium", description: "Finish top 3 in a challenge", emoji: "🏆", rarity: "rare", test: (c) => c.stats.podiums >= 1 },
  { id: "champion", name: "Champion", description: "Win a challenge or hackathon", emoji: "🏆", rarity: "epic", test: (c) => c.stats.eventWins >= 1 },
  { id: "study_buddy", name: "Study Buddy", description: "Join a live study session", emoji: "📖", rarity: "common", test: (c) => c.stats.sessionsJoined >= 1 },
];

export function normalizeStats(raw: Partial<PlayerStats> | undefined): PlayerStats {
  return { ...EMPTY_STATS, ...(raw || {}) };
}

export function newlyEarnedBadges(ctx: BadgeContext, owned: Record<string, unknown> | undefined): BadgeDef[] {
  const have = owned || {};
  return BADGES.filter((b) => !have[b.id] && b.test(ctx));
}
