import { describe, it, expect } from "vitest";
import {
  rankVideosForStudent,
  scoreVideo,
  type VideoItem,
  type StudentSignals,
} from "./ranking";

describe("Per-student video ranking", () => {
  const sampleVideos: VideoItem[] = [
    {
      id: "vid-teacher",
      title: "Teacher Overview of Calculus",
      thumbnail: "https://example.com/thumb1.jpg",
      teacherRecommended: true,
      learningStyles: ["verbal", "step-by-step"],
    },
    {
      id: "vid-visual",
      title: "3D Animation of Derivatives",
      thumbnail: "https://example.com/thumb2.jpg",
      learningStyles: ["visual"],
    },
    {
      id: "vid-interactive",
      title: "Hands-on Calculus Sandbox",
      thumbnail: "https://example.com/thumb3.jpg",
      learningStyles: ["interactive"],
    },
    {
      id: "vid-practical",
      title: "Real World Calculus Examples",
      thumbnail: "https://example.com/thumb4.jpg",
      learningStyles: ["practical"],
    },
  ];

  it("always keeps teacher-recommended video first with 'Recommended by your teacher'", () => {
    // Give vid-visual huge signals
    const signals: StudentSignals = {
      learningStyle: "visual",
      engagements: {
        "vid-visual": {
          videoId: "vid-visual",
          ledToCorrectAnswer: true,
          helpfulTaps: 3,
          completed: true,
          watchSeconds: 300,
        },
      },
    };

    const ranked = rankVideosForStudent(sampleVideos, signals);

    expect(ranked[0].id).toBe("vid-teacher");
    expect(ranked[0].badge).toBe("Recommended by your teacher");
    // The second video should now be vid-visual due to high signals
    expect(ranked[1].id).toBe("vid-visual");
    expect(ranked[1].badge).toBe("Picked for how you learn");
  });

  it("preserves exact teacher order when no signals are provided", () => {
    const ranked = rankVideosForStudent(sampleVideos);

    expect(ranked.map((v) => v.id)).toEqual([
      "vid-teacher",
      "vid-visual",
      "vid-interactive",
      "vid-practical",
    ]);

    expect(ranked[0].badge).toBe("Recommended by your teacher");
    expect(ranked[1].badge).toBe("Picked for how you learn");
    expect(ranked[2].badge).toBe("Picked for how you learn");
    expect(ranked[3].badge).toBe("Picked for how you learn");
  });

  it("is strictly deterministic: same signals give identical order across runs", () => {
    const signals: StudentSignals = {
      learningStyle: "interactive",
      engagements: {
        "vid-practical": {
          videoId: "vid-practical",
          helpfulTaps: 1,
          completed: true,
        },
        "vid-interactive": {
          videoId: "vid-interactive",
          watchSeconds: 120,
        },
      },
    };

    const run1 = rankVideosForStudent(sampleVideos, signals);
    const run2 = rankVideosForStudent(sampleVideos, signals);

    expect(run1.map((v) => v.id)).toEqual(run2.map((v) => v.id));
    expect(run1.map((v) => v.rankingScore)).toEqual(run2.map((v) => v.rankingScore));
  });

  it("boosts video that led to a correct answer afterwards", () => {
    const signals: StudentSignals = {
      engagements: {
        "vid-practical": {
          videoId: "vid-practical",
          ledToCorrectAnswer: true, // +50 points
        },
        "vid-visual": {
          videoId: "vid-visual",
          completed: true, // +15 points
        },
      },
    };

    const ranked = rankVideosForStudent(sampleVideos, signals);

    expect(ranked[0].id).toBe("vid-teacher");
    expect(ranked[1].id).toBe("vid-practical"); // Ranked highest among rest
    expect(ranked[2].id).toBe("vid-visual");
    expect(ranked[3].id).toBe("vid-interactive");
  });

  it("boosts video matching student learning style", () => {
    const signals: StudentSignals = {
      learningStyle: "interactive",
    };

    const ranked = rankVideosForStudent(sampleVideos, signals);

    expect(ranked[0].id).toBe("vid-teacher");
    expect(ranked[1].id).toBe("vid-interactive"); // matches student's style
  });

  it("correctly computes individual video score weights", () => {
    const video: VideoItem = {
      id: "v1",
      title: "Test",
      thumbnail: "",
      learningStyles: ["visual"],
    };

    const score = scoreVideo(video, {
      learningStyle: "visual",
      engagements: {
        v1: {
          videoId: "v1",
          ledToCorrectAnswer: true, // 50
          helpfulTaps: 2, // 20 * 2 = 40
          completed: true, // 15
          watchSeconds: 150, // min(10, 150/30 = 5) = 5
        },
      },
    });

    // 50 + 40 + 15 + 5 + 10 (style match) = 120
    expect(score).toBe(120);
  });
});
