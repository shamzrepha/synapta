/**
 * Per-student video ranking pure function.
 * Orders videos based on teacher recommendation, learning style alignment,
 * watch time, completion, helpful feedback, and subsequent correct quiz answers.
 */

export type LearningStyle =
  | "visual"
  | "interactive"
  | "verbal"
  | "practical"
  | "step-by-step"
  | string;

export interface VideoItem {
  id: string;
  title: string;
  channel?: string;
  channelId?: string;
  thumbnail: string;
  teacherRecommended?: boolean;
  learningStyles?: LearningStyle[];
}

export interface VideoEngagementSignal {
  videoId: string;
  watchSeconds?: number;
  completed?: boolean;
  helpfulTaps?: number;
  ledToCorrectAnswer?: boolean;
}

export interface StudentSignals {
  learningStyle?: LearningStyle;
  engagements?: Record<string, VideoEngagementSignal>;
}

export interface RankedVideo extends VideoItem {
  badge: "Recommended by your teacher" | "Picked for how you learn";
  rankingScore: number;
}

/**
 * Computes a numeric ranking score for a video given a student's signals.
 */
export function scoreVideo(
  video: VideoItem,
  signals?: StudentSignals
): number {
  if (!signals) return 0;

  let score = 0;
  const eng = signals.engagements?.[video.id];

  if (eng) {
    // High impact: led to correct answer on the topic afterwards
    if (eng.ledToCorrectAnswer) {
      score += 50;
    }
    // High impact: student explicitly marked the video helpful
    if (eng.helpfulTaps && eng.helpfulTaps > 0) {
      score += 20 * Math.min(eng.helpfulTaps, 3);
    }
    // Moderate impact: completed the video
    if (eng.completed) {
      score += 15;
    }
    // Watch time contribution (capped at 10 points)
    if (eng.watchSeconds && eng.watchSeconds > 0) {
      score += Math.min(10, Math.floor(eng.watchSeconds / 30));
    }
  }

  // Learning style alignment
  if (
    signals.learningStyle &&
    video.learningStyles &&
    video.learningStyles.includes(signals.learningStyle)
  ) {
    score += 10;
  }

  return score;
}

/**
 * Pure function: ranks videos for a student.
 * - Teacher-recommended video always remains #1 with "Recommended by your teacher"
 * - Remaining videos are ranked descending by signal score with "Picked for how you learn"
 * - Stable tie-breaking guarantees:
 *     * Same signals -> identical order
 *     * No signals -> original teacher order
 */
export function rankVideosForStudent(
  videos: VideoItem[],
  signals?: StudentSignals
): RankedVideo[] {
  if (!videos || videos.length === 0) return [];

  // Find teacher recommended index (explicit flag, or default to the first video in the list)
  let teacherIndex = videos.findIndex((v) => v.teacherRecommended === true);
  if (teacherIndex < 0) {
    teacherIndex = 0;
  }

  const teacherPick = videos[teacherIndex];
  const remaining = videos
    .map((v, originalIndex) => ({ video: v, originalIndex }))
    .filter((_, idx) => idx !== teacherIndex);

  // Score remaining videos
  const scoredRemaining = remaining.map(({ video, originalIndex }) => {
    const score = scoreVideo(video, signals);
    return {
      video,
      originalIndex,
      score,
    };
  });

  // Sort descending by score; if tied, preserve original order
  scoredRemaining.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.originalIndex - b.originalIndex;
  });

  const rankedFirst: RankedVideo = {
    ...teacherPick,
    badge: "Recommended by your teacher",
    rankingScore: scoreVideo(teacherPick, signals),
  };

  const rankedOthers: RankedVideo[] = scoredRemaining.map((item) => ({
    ...item.video,
    badge: "Picked for how you learn",
    rankingScore: item.score,
  }));

  return [rankedFirst, ...rankedOthers];
}
