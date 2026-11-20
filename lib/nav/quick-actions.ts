/** Pure selection of the dashboard "Quick actions" tiles. Hrefs come from the feature registry where a feature exists. */
import { FEATURES } from "@/lib/features/registry";

export type Role = "student" | "teacher" | "admin";
export type IconKey = "continue" | "classes" | "cards" | "quiz" | "written" | "notes" | "papers" | "tutor" | "progress" | "create" | "plans" | "grading" | "attendance" | "announce" | "labs" | "forYou" | "admin";

export interface QuickAction {
  id: string;
  label: string;
  href: string;
  icon: IconKey;
  /** small count or word shown on the tile */
  badge?: string;
}

export interface QuickState {
  role?: string;
  /** flashcards due today */
  dueCards?: number;
  /** an unfinished lesson to resume */
  resume?: { href: string; title?: string } | null;
  classCount?: number;
}

const hrefOf = (id: string, fallback: string) => FEATURES.find((f) => f.id === id)?.href ?? fallback;

export function normalizeRole(role: unknown): Role {
  return role === "teacher" || role === "admin" ? role : "student";
}

export function pickQuickActions(s: QuickState): QuickAction[] {
  const role = normalizeRole(s.role);
  if (role !== "student") {
    const list: QuickAction[] = [
      { id: "classes", label: "My classes", href: "/classes/manage", icon: "classes" },
      { id: "create", label: "Create class", href: "/explore?create=1", icon: "create" },
      { id: "plans", label: "Lesson plans", href: hrefOf("lessonplans", "/teach/plans"), icon: "plans" },
      { id: "grading", label: "Grade work", href: hrefOf("grading", "/teach/grading"), icon: "grading" },
      { id: "attendance", label: "Attendance", href: hrefOf("attendance", "/teach/attendance"), icon: "attendance" },
      { id: "announce", label: "Announcements", href: hrefOf("announcements", "/classes/announcements"), icon: "announce" },
      { id: "notes", label: "Make notes", href: hrefOf("notes", "/study/notes"), icon: "notes" },
      role === "admin" ? { id: "admin", label: "Admin console", href: "/admin", icon: "admin" } : { id: "progress", label: "Class progress", href: "/classes/heatmap", icon: "progress" },
    ];
    return list;
  }
  const due = Math.max(0, Math.floor(s.dueCards || 0));
  const first: QuickAction = s.resume
    ? { id: "continue", label: "Continue reading", href: s.resume.href, icon: "continue", badge: "Unfinished" }
    : { id: "classes", label: "My classes", href: "/classes/manage", icon: "classes" };
  return [
    first,
    { id: "cards", label: "Flashcards", href: hrefOf("flashcards", "/study/flashcards"), icon: "cards", badge: due > 0 ? (due > 99 ? "99+" : String(due)) : undefined },
    { id: "quiz", label: "Quick quiz", href: hrefOf("daily", "/study/daily"), icon: "quiz" },
    { id: "written", label: "Written practice", href: "/practice/written", icon: "written" },
    { id: "notes", label: "Notes from PDF", href: hrefOf("notes", "/study/notes"), icon: "notes" },
    { id: "papers", label: "Past questions", href: hrefOf("papers", "/study/papers"), icon: "papers" },
    { id: "tutor", label: "Ask the tutor", href: "/tutor", icon: "tutor" },
    { id: "progress", label: "My progress", href: "/classes/heatmap", icon: "progress" },
  ];
}

/** Palette suggestions shown before the user types: the same tiles plus For you and Labs. */
export function paletteSuggestions(role: unknown): QuickAction[] {
  const base = pickQuickActions({ role: normalizeRole(role) });
  if (normalizeRole(role) !== "student") return base;
  return [...base, { id: "forYou", label: "For you", href: hrefOf("for-you", "/for-you"), icon: "forYou" }, { id: "labs", label: "Labs and studio", href: "/studio", icon: "labs" }];
}
