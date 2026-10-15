import type { QuestMetric } from "@/lib/game/quests";

export interface SeasonTask {
  id: string;
  title: string;
  metric: QuestMetric;
  target: number;
}

export interface SeasonDef {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  /** inclusive, YYYY-MM-DD (UTC) */
  start: string;
  end: string;
  tasks: SeasonTask[];
  rewardXp: number;
  badge: { id: string; name: string; emoji: string; description: string };
}

export const SEASONS: SeasonDef[] = [
  {
    id: "back-to-school-2026",
    name: "Back to School",
    emoji: "🎒",
    blurb: "Ease into the term with a steady learning rhythm.",
    start: "2026-09-01",
    end: "2026-09-30",
    tasks: [
      { id: "quiz", title: "Answer 40 quiz questions", metric: "quizAnswered", target: 40 },
      { id: "cards", title: "Review 40 flashcards", metric: "flashcards", target: 40 },
      { id: "xp", title: "Earn 400 XP", metric: "xp", target: 400 },
    ],
    rewardXp: 150,
    badge: { id: "season_back_to_school_2026", name: "Back to School", emoji: "🎒", description: "Finished the Back to School season" },
  },
  {
    id: "exam-season-2026",
    name: "Exam Season",
    emoji: "📝",
    blurb: "Revision time: quizzes, flashcards and mastery.",
    start: "2026-10-01",
    end: "2026-11-15",
    tasks: [
      { id: "correct", title: "Answer 100 quiz questions correctly", metric: "quizCorrect", target: 100 },
      { id: "cards", title: "Review 100 flashcards", metric: "flashcards", target: 100 },
      { id: "mastery", title: "Master 2 topics", metric: "masteries", target: 2 },
      { id: "xp", title: "Earn 1,000 XP", metric: "xp", target: 1000 },
    ],
    rewardXp: 300,
    badge: { id: "season_exam_2026", name: "Exam Ace", emoji: "📝", description: "Finished the Exam Season" },
  },
  {
    id: "maker-month-2026",
    name: "Maker Month",
    emoji: "🛠️",
    blurb: "Build, share and experiment.",
    start: "2026-11-16",
    end: "2026-12-15",
    tasks: [
      { id: "labs", title: "Pass 5 simulation checks", metric: "labs", target: 5 },
      { id: "posts", title: "Share 3 posts", metric: "posts", target: 3 },
      { id: "comments", title: "Write 10 comments", metric: "comments", target: 10 },
      { id: "event", title: "Join a challenge", metric: "eventsJoined", target: 1 },
    ],
    rewardXp: 250,
    badge: { id: "season_maker_2026", name: "Maker", emoji: "🛠️", description: "Finished Maker Month" },
  },
  {
    id: "winter-sprint-2026",
    name: "Winter Sprint",
    emoji: "❄️",
    blurb: "Stay consistent through the holidays.",
    start: "2026-12-16",
    end: "2027-01-31",
    tasks: [
      { id: "xp", title: "Earn 1,200 XP", metric: "xp", target: 1200 },
      { id: "correct", title: "Answer 80 quiz questions correctly", metric: "quizCorrect", target: 80 },
      { id: "cards", title: "Review 80 flashcards", metric: "flashcards", target: 80 },
    ],
    rewardXp: 300,
    badge: { id: "season_winter_2026", name: "Winter Sprinter", emoji: "❄️", description: "Finished the Winter Sprint" },
  },
  {
    id: "spring-bloom-2027",
    name: "Spring Bloom",
    emoji: "🌱",
    blurb: "Grow new skills as the term picks back up.",
    start: "2027-02-01",
    end: "2027-03-31",
    tasks: [
      { id: "mastery", title: "Master 3 topics", metric: "masteries", target: 3 },
      { id: "xp", title: "Earn 1,500 XP", metric: "xp", target: 1500 },
      { id: "labs", title: "Pass 5 simulation checks", metric: "labs", target: 5 },
    ],
    rewardXp: 300,
    badge: { id: "season_spring_2027", name: "In Bloom", emoji: "🌱", description: "Finished Spring Bloom" },
  },
];

export type SeasonStatus = "upcoming" | "active" | "ended";

export function seasonStatus(s: SeasonDef, today: string): SeasonStatus {
  if (today < s.start) return "upcoming";
  if (today > s.end) return "ended";
  return "active";
}

export function activeSeasons(today: string, seasons: SeasonDef[] = SEASONS): SeasonDef[] {
  return seasons.filter((s) => seasonStatus(s, today) === "active");
}

export type SeasonCounters = Record<string, number>;

/** Only events inside the season window count. Returns the new counters, or null if nothing changed. */
export function applySeasonDelta(
  season: SeasonDef,
  counters: SeasonCounters,
  delta: Partial<Record<string, number>>,
  today: string
): SeasonCounters | null {
  if (seasonStatus(season, today) !== "active") return null;
  let changed = false;
  const next = { ...counters };
  for (const t of season.tasks) {
    const inc = delta[t.metric] || 0;
    if (inc > 0 && (next[t.metric] || 0) < t.target) {
      next[t.metric] = Math.min(t.target, (next[t.metric] || 0) + inc);
      changed = true;
    }
  }
  return changed ? next : null;
}

export interface TaskProgress extends SeasonTask {
  value: number;
  done: boolean;
}

export function taskProgress(season: SeasonDef, counters: SeasonCounters): TaskProgress[] {
  return season.tasks.map((t) => {
    const value = Math.min(t.target, Math.max(0, counters[t.metric] || 0));
    return { ...t, value, done: value >= t.target };
  });
}

export function seasonComplete(season: SeasonDef, counters: SeasonCounters): boolean {
  return taskProgress(season, counters).every((t) => t.done);
}

export function daysLeft(season: SeasonDef, today: string): number {
  return Math.max(0, Math.round((Date.parse(`${season.end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) + 1);
}
