/** What Sprout says when you open a class: a short, honest line based on how you are doing there. */
export interface ClassProgress {
  /** average mastery 0..1 across the class's topics (null when nothing is known yet) */
  avg: number | null;
  topics: number;
  /** topics at or above the mastery bar */
  mastered: number;
  /** topics the learner has tried at least once */
  started: number;
  streakDays: number;
  /** title of the topic they were reading last, when known */
  leftOff?: string | null;
}

export function classEncouragement(p: ClassProgress): string {
  if (p.topics <= 0) return "This class has no topics yet. I'll keep an eye out for new ones!";
  const streak = p.streakDays >= 3 ? ` ${p.streakDays}-day streak. Keep it going!` : "";
  if (p.started <= 0 || p.avg === null) {
    return `Fresh start! Pick any topic and I'll be right here.${streak}`.slice(0, 140);
  }
  const resume = p.leftOff ? ` Want to pick up at "${p.leftOff.slice(0, 40)}"?` : " Try the next topic.";
  let line: string;
  if (p.avg >= 0.85) line = `Wow, ${p.mastered} of ${p.topics} topics mastered. You really know this one!`;
  else if (p.avg >= 0.6) line = `Solid progress: ${p.mastered} of ${p.topics} topics mastered. One more push!${p.leftOff ? resume : ""}`;
  else if (p.avg >= 0.35) line = `You're getting there, ${p.started} topic${p.started === 1 ? "" : "s"} started.${resume}`;
  else line = `Every expert started here. One small topic at a time, you've got this.${p.leftOff ? resume : ""}`;
  return `${line}${streak}`.slice(0, 180);
}

/** A hello that fits the hour (0-23), so Sprout does not say "ready to learn?" at 2 in the morning. */
export function dayHello(hour: number): string {
  if (hour >= 0 && hour < 5) return "Up late? Don't forget to rest!";
  if (hour < 12) return "Good morning!";
  if (hour < 18) return "Good afternoon!";
  return "Good evening!";
}
