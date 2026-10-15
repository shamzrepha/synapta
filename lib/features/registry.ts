/**
 * Every student-facing feature in one list. The Features hub (/more) renders it; each feature flips
 * its own `status` to "live" when it ships. One entry per line so parallel work merges cleanly.
 */
export type FeatureGroup = "Study" | "Social" | "Maker" | "Rewards" | "Teachers" | "Everywhere";

export interface FeatureEntry {
  n: number;
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  href: string;
  group: FeatureGroup;
  status: "live" | "soon";
}

export const FEATURES: FeatureEntry[] = [
  { n: 1, id: "flashcards", title: "AI flashcards", blurb: "Turn any lesson into spaced-repetition cards.", emoji: "🃏", href: "/study/flashcards", group: "Study", status: "soon" },
  { n: 2, id: "daily", title: "Daily 5-minute challenge", blurb: "Five questions from what you got wrong.", emoji: "⚡", href: "/study/daily", group: "Study", status: "soon" },
  { n: 3, id: "snap", title: "Snap your homework", blurb: "Photograph a problem; the AI explains it step by step.", emoji: "📸", href: "/study/snap", group: "Study", status: "soon" },
  { n: 4, id: "exams", title: "Exam countdown planner", blurb: "A revision schedule built backwards from your exam date.", emoji: "🗓️", href: "/study/exams", group: "Study", status: "soon" },
  { n: 5, id: "papers", title: "Past-paper mode", blurb: "Timed papers, AI-marked, with a weak-topic report.", emoji: "📝", href: "/study/papers", group: "Study", status: "soon" },
  { n: 6, id: "focus", title: "Focus rooms", blurb: "Pomodoro with friends, silently, with a streak.", emoji: "🍅", href: "/focus", group: "Study", status: "soon" },
  { n: 7, id: "eli", title: "Explain it like I'm 12", blurb: "Switch any explanation between simple and lecturer level.", emoji: "🧒", href: "/tutor", group: "Study", status: "soon" },
  { n: 8, id: "voice", title: "Voice tutor", blurb: "Talk to the AI hands-free.", emoji: "🎙️", href: "/tutor/voice", group: "Study", status: "soon" },
  { n: 9, id: "mistakes", title: "Mistake notebook", blurb: "Every wrong answer saved with the fix and re-tested.", emoji: "📕", href: "/study/mistakes", group: "Study", status: "soon" },
  { n: 10, id: "mindmap", title: "Mind-map maker", blurb: "A mind map from any lesson or your notes.", emoji: "🧠", href: "/study/mindmap", group: "Study", status: "soon" },
  { n: 11, id: "groups", title: "Study groups", blurb: "Shared notebook, goals and a group streak.", emoji: "👥", href: "/groups", group: "Social", status: "soon" },
  { n: 12, id: "ask", title: "Anonymous ask", blurb: "“I don't get this” without anyone knowing it's you.", emoji: "🙈", href: "/ask", group: "Social", status: "soon" },
  { n: 13, id: "tutors", title: "Peer tutoring", blurb: "Earn XP for great answers; rate your helpers.", emoji: "🤝", href: "/tutors", group: "Social", status: "soon" },
  { n: 14, id: "weekly", title: "Weekly leaderboards", blurb: "Resets every week so newcomers can win.", emoji: "🏆", href: "/leaderboard?period=week", group: "Social", status: "soon" },
  { n: 15, id: "shoutouts", title: "Shout-outs", blurb: "Send a thank-you badge to someone who helped.", emoji: "💌", href: "/shoutouts", group: "Social", status: "soon" },
  { n: 16, id: "explainers", title: "60-second explainers", blurb: "Short student-made videos that explain a concept.", emoji: "🎬", href: "/explainers", group: "Social", status: "soon" },
  { n: 17, id: "live", title: "Live study events", blurb: "Countdowns and RSVPs for study sessions.", emoji: "📡", href: "/sessions", group: "Social", status: "soon" },
  { n: 18, id: "communities", title: "School communities", blurb: "A feed and tags for your campus.", emoji: "🏫", href: "/communities", group: "Social", status: "soon" },
  { n: 19, id: "mentors", title: "Mentor matching", blurb: "Seniors paired with juniors by subject.", emoji: "🧭", href: "/mentors", group: "Social", status: "soon" },
  { n: 20, id: "polls", title: "Polls & this-or-that", blurb: "Quick questions that start discussions.", emoji: "📊", href: "/polls", group: "Social", status: "soon" },
  { n: 21, id: "wall", title: "Maker Wall", blurb: "Show your build with a video and parts list.", emoji: "🧱", href: "/studio/wall", group: "Maker", status: "live" },
  { n: 22, id: "contests", title: "Build contests", blurb: "Compete with a shared parts budget.", emoji: "🏁", href: "/studio/contests", group: "Maker", status: "live" },
  { n: 23, id: "buildguide", title: "Real-build guide", blurb: "A printable shopping list and wiring sheet.", emoji: "🧾", href: "/studio", group: "Maker", status: "live" },
  { n: 24, id: "debug", title: "Debug my circuit", blurb: "Photo of your real breadboard in, fixes out.", emoji: "🔍", href: "/studio/debug", group: "Maker", status: "soon" },
  { n: 25, id: "parts", title: "More verified parts", blurb: "Stepper, OLED, DHT11, relay, MPU6050.", emoji: "🔩", href: "/studio/shop", group: "Maker", status: "soon" },
  { n: 26, id: "team", title: "Team builds", blurb: "Two people edit one design at the same time.", emoji: "🛠️", href: "/studio", group: "Maker", status: "soon" },
  { n: 27, id: "experiments", title: "Science experiments", blurb: "Chemistry and physics simulators.", emoji: "🧪", href: "/experiments", group: "Maker", status: "soon" },
  { n: 28, id: "export", title: "Export designs", blurb: "Printable PDF guide and 3D-printable file.", emoji: "🖨️", href: "/studio", group: "Maker", status: "live" },
  { n: 29, id: "quests", title: "Seasonal quests", blurb: "Limited-time quests with special badges.", emoji: "🎯", href: "/quests", group: "Rewards", status: "soon" },
  { n: 30, id: "freeze", title: "Streak freezes", blurb: "Earn a freeze and recover a missed day.", emoji: "🧊", href: "/streak", group: "Rewards", status: "soon" },
  { n: 31, id: "shop", title: "XP shop", blurb: "Spend points on themes, avatars and titles.", emoji: "🛍️", href: "/shop", group: "Rewards", status: "soon" },
  { n: 32, id: "report", title: "Weekly report card", blurb: "A summary you can share with a parent or teacher.", emoji: "📋", href: "/report", group: "Rewards", status: "soon" },
  { n: 33, id: "goals", title: "Goal tracker", blurb: "“Pass physics by March” turned into daily tasks.", emoji: "🎓", href: "/goals", group: "Rewards", status: "soon" },
  { n: 34, id: "heatmap", title: "Study heatmap", blurb: "Your study days at a glance, like GitHub's.", emoji: "🟩", href: "/activity", group: "Rewards", status: "soon" },
  { n: 35, id: "plans", title: "AI lesson plans", blurb: "Lesson plans and quizzes from a syllabus upload.", emoji: "🧑‍🏫", href: "/teach/plans", group: "Teachers", status: "soon" },
  { n: 36, id: "grading", title: "Auto-grading", blurb: "AI marks short answers; you can override.", emoji: "✅", href: "/teach/grading", group: "Teachers", status: "soon" },
  { n: 37, id: "attendance", title: "Attendance check-ins", blurb: "Check in to live sessions to record attendance.", emoji: "🙋", href: "/teach/attendance", group: "Teachers", status: "soon" },
  { n: 38, id: "announcements", title: "Class announcements", blurb: "Announcements with read receipts.", emoji: "📣", href: "/classes/announcements", group: "Teachers", status: "soon" },
  { n: 39, id: "offline", title: "Offline mode", blurb: "Download lessons and notes for patchy internet.", emoji: "📴", href: "/offline", group: "Everywhere", status: "soon" },
  { n: 40, id: "datasaver", title: "Data-saver mode", blurb: "Skip audio and 3D unless you tap.", emoji: "📉", href: "/settings", group: "Everywhere", status: "soon" },
];
