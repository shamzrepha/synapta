/** The "Everything" page, grouped by what the person wants to do. Built from the feature registry plus a few nav-only pages. */
import { FEATURES } from "@/lib/features/registry";
import { normalizeRole, type Role } from "./quick-actions";

export type MoreGroupName = "Study" | "Practice" | "Build and labs" | "Community" | "Teach" | "Account";
export const MORE_ORDER: MoreGroupName[] = ["Study", "Practice", "Build and labs", "Community", "Teach", "Account"];
export const MORE_HINT: Record<MoreGroupName, string> = {
  Study: "Learn from your classes and your own material",
  Practice: "Check you know it",
  "Build and labs": "Make and test things",
  Community: "Study with other people",
  Teach: "For teachers",
  Account: "You, your rewards and settings",
};

export interface MoreEntry {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  href: string;
  group: MoreGroupName;
  teacherOnly?: boolean;
}

const GROUP_BY_ID: Record<string, MoreGroupName> = {
  "for-you": "Study", "learning-map": "Study", worlds: "Study", notes: "Study", snap: "Study", eli: "Study", voice: "Study", mindmap: "Study", exams: "Study", focus: "Study", goals: "Study", offline: "Study",
  flashcards: "Practice", daily: "Practice", papers: "Practice", mistakes: "Practice", evaluation: "Practice",
  wall: "Build and labs", contests: "Build and labs", buildguide: "Build and labs", debug: "Build and labs", parts: "Build and labs", experiments: "Build and labs",
  groups: "Community", ask: "Community", tutors: "Community", weekly: "Community", shoutouts: "Community", explainers: "Community", live: "Community", communities: "Community", mentors: "Community", polls: "Community",
  lessonplans: "Teach", grading: "Teach", attendance: "Teach", announcements: "Teach", schools: "Teach",
  quests: "Account", freeze: "Account", shop: "Account", report: "Account", heatmap: "Account", plans: "Account",
};
/** registry ids that repeat another entry's page or just point at Settings: they stay in the registry but not in this list */
const SKIP = new Set(["team", "export", "datasaver"]);

const EXTRAS: MoreEntry[] = [
  { id: "x-classes", title: "My classes", blurb: "Your courses, lessons and quizzes.", emoji: "🎓", href: "/classes/manage", group: "Study" },
  { id: "x-explore", title: "Find a class", blurb: "Search for a class or join with a code.", emoji: "🧭", href: "/explore", group: "Study" },
  { id: "x-notebook", title: "AI Notebook", blurb: "Chat with your own documents, with sources.", emoji: "📓", href: "/notebook", group: "Study" },
  { id: "x-library", title: "Library", blurb: "Your notes, notebooks, decks and Worlds in one place.", emoji: "📚", href: "/study/library", group: "Study" },
  { id: "x-review", title: "Review", blurb: "Flashcards, mistakes and topics that are due.", emoji: "🔁", href: "/study/review", group: "Practice" },
  { id: "x-written", title: "Written practice", blurb: "Answer in your own words and get marked.", emoji: "📝", href: "/practice/written", group: "Practice" },
  { id: "x-weak", title: "Weak topics", blurb: "See what to revise next.", emoji: "🎯", href: "/classes/heatmap", group: "Practice" },
  { id: "x-studio", title: "Maker Studio", blurb: "Build circuits, robots and 3D designs.", emoji: "🛠️", href: "/studio", group: "Build and labs" },
  { id: "x-feed", title: "Feed", blurb: "Posts and questions from people you follow.", emoji: "📰", href: "/feed", group: "Community" },
  { id: "x-messages", title: "Messages", blurb: "Chat privately with friends.", emoji: "💬", href: "/messages", group: "Community" },
  { id: "x-friends", title: "Friends", blurb: "Find and add classmates.", emoji: "🧑‍🤝‍🧑", href: "/friends", group: "Community" },
  { id: "x-challenges", title: "Challenges", blurb: "Quick duels and build challenges.", emoji: "⚔️", href: "/challenges", group: "Community" },
  { id: "x-lounge", title: "Study rooms", blurb: "Drop in and study next to others.", emoji: "🛋️", href: "/lounge", group: "Community" },
  { id: "x-profile", title: "Profile and badges", blurb: "Your level, badges and details.", emoji: "🧑", href: "/profile", group: "Account" },
  { id: "x-saved", title: "Saved", blurb: "Things you bookmarked.", emoji: "🔖", href: "/saved", group: "Account" },
  { id: "x-notifications", title: "Notifications", blurb: "What happened while you were away.", emoji: "🔔", href: "/notifications", group: "Account" },
  { id: "x-settings", title: "Settings", blurb: "Theme, language, data saver, and a tour of the app.", emoji: "⚙️", href: "/settings", group: "Account" },
];

const pathOf = (href: string) => href.split("?")[0];

/** All entries, one per page (first wins), for everyone. Role filtering is done in moreGroupsFor. */
export function allMoreEntries(): MoreEntry[] {
  const fromRegistry: MoreEntry[] = FEATURES.filter((f) => f.status === "live" && !SKIP.has(f.id)).map((f) => ({
    id: f.id, title: f.title, blurb: f.blurb, emoji: f.emoji, href: f.href,
    group: GROUP_BY_ID[f.id] ?? (f.group === "Teachers" ? "Teach" : f.group === "Social" ? "Community" : f.group === "Maker" ? "Build and labs" : f.group === "Rewards" ? "Account" : "Study"),
    teacherOnly: f.group === "Teachers",
  }));
  const seen = new Set<string>();
  const seenTitle = new Set<string>();
  const out: MoreEntry[] = [];
  for (const e of [...EXTRAS, ...fromRegistry]) {
    const p = pathOf(e.href);
    const t = e.title.toLowerCase();
    if (seen.has(p) || seenTitle.has(t)) continue;
    seen.add(p);
    seenTitle.add(t);
    out.push(e);
  }
  return out;
}

export function moreGroupsFor(role: unknown): Array<{ name: MoreGroupName; hint: string; items: MoreEntry[] }> {
  const r: Role = normalizeRole(role);
  const all = allMoreEntries().filter((e) => !e.teacherOnly || r !== "student");
  return MORE_ORDER.map((name) => ({ name, hint: MORE_HINT[name], items: all.filter((e) => e.group === name) })).filter((g) => g.items.length > 0);
}
