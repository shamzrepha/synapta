/**
 * Level curve: reaching level n needs 50·n·(n−1) total XP
 * (L2 = 100, L3 = 300, L5 = 1,000, L10 = 4,500, L20 = 19,000). Early levels come fast, later ones
 * take sustained effort.
 */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return 50 * n * (n - 1);
}

const TITLES: Array<{ min: number; title: string }> = [
  { min: 1, title: "Novice" },
  { min: 3, title: "Apprentice" },
  { min: 6, title: "Scholar" },
  { min: 10, title: "Adept" },
  { min: 15, title: "Expert" },
  { min: 21, title: "Master" },
  { min: 30, title: "Sage" },
  { min: 40, title: "Legend" },
];

export function titleForLevel(level: number): string {
  let t = TITLES[0].title;
  for (const entry of TITLES) if (level >= entry.min) t = entry.title;
  return t;
}

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number; // 0..1 within the current level
}

export function levelFromXp(xpRaw: number): LevelInfo {
  const xp = Math.max(0, Math.floor(xpRaw || 0));
  // Solve 50·n·(n−1) <= xp for the largest n
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2));
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  return {
    level,
    title: titleForLevel(level),
    xp,
    currentLevelXp,
    nextLevelXp,
    progress: (xp - currentLevelXp) / Math.max(1, nextLevelXp - currentLevelXp),
  };
}
