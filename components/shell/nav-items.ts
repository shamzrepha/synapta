import { Home, GraduationCap, Compass, User, ShieldCheck, Bookmark, Wrench, BookOpen, Users, LayoutGrid } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  /** one plain sentence shown under the label where there is room */
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Array<"student" | "teacher" | "admin">;
  group: "main" | "account";
  /** other routes that belong to this area, so the item stays highlighted while you are inside it */
  match?: string[];
  /** shown in the phone's bottom bar (the rest go in "More") */
  primary?: boolean;
}

const ALL = ["student", "teacher", "admin"] as Array<"student" | "teacher" | "admin">;

/**
 * Six places, each with a plain name. Everything else lives inside one of the hub pages
 * (Study, Community) or inside the area itself, so nothing is scattered.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", hint: "Start here", icon: Home, roles: ALL, group: "main", primary: true },
  {
    label: "My classes",
    href: "/classes/manage",
    hint: "Classes you joined",
    icon: GraduationCap,
    roles: ALL,
    group: "main",
    primary: true,
    match: ["/classes"],
  },
  { label: "Find a class", href: "/explore", hint: "Join a new one", icon: Compass, roles: ALL, group: "main" },
  {
    label: "Study",
    href: "/study",
    hint: "AI tutor, notes, practice",
    icon: BookOpen,
    roles: ALL,
    group: "main",
    primary: true,
    match: ["/tutor", "/notebook", "/focus", "/experiments", "/goals", "/report", "/quests", "/streak", "/shop"],
  },
  { label: "Make", href: "/studio", hint: "Build & simulate projects", icon: Wrench, roles: ALL, group: "main", primary: true },
  {
    label: "Community",
    href: "/community",
    hint: "Friends, chat, challenges",
    icon: Users,
    roles: ALL,
    group: "main",
    primary: true,
    match: ["/feed", "/messages", "/challenges", "/leaderboard", "/sessions", "/lounge", "/friends", "/groups", "/ask", "/tutors", "/polls", "/shoutouts", "/communities", "/mentors", "/explainers"],
  },
  { label: "Saved", href: "/saved", icon: Bookmark, roles: ALL, group: "account" },
  { label: "Profile", href: "/profile", icon: User, roles: ALL, group: "account" },
  { label: "Everything", href: "/more", hint: "Every feature, searchable", icon: LayoutGrid, roles: ALL, group: "account" },
  { label: "Admin Console", href: "/admin", icon: ShieldCheck, roles: ["admin"], group: "account" },
];

export function isActivePath(pathname: string, href: string, match: string[] = []): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  // "My classes" is /classes/manage but a class page is /classes/<id>
  return [href, ...match].some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Top-level destinations: no back button there. */
export const ROOT_PATHS = ["/dashboard", "/classes/manage", "/explore", "/study", "/studio", "/community", "/profile", "/more", "/saved"];
