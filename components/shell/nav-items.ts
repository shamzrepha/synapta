import { Home, GraduationCap, User, ShieldCheck, Bookmark, BookOpen, Users, LayoutGrid } from "lucide-react";

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
 * Four places, each with a plain name. Everything else lives inside one of them: classes and finding a class
 * share one page (tabs), study tools and the maker studio share one hub, and the social pages share one hub.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", hint: "Your daily path", icon: Home, roles: ALL, group: "main", primary: true },
  {
    label: "My classes",
    href: "/classes/manage",
    hint: "Your courses · find new ones",
    icon: GraduationCap,
    roles: ALL,
    group: "main",
    primary: true,
    match: ["/classes", "/explore"],
  },
  {
    label: "Notebook & Studio",
    href: "/study",
    hint: "Study alone · build things",
    icon: BookOpen,
    roles: ALL,
    group: "main",
    primary: true,
    match: ["/notebook", "/studio", "/tutor", "/focus", "/experiments", "/goals", "/report", "/quests", "/streak", "/shop"],
  },
  {
    label: "Community",
    href: "/community",
    hint: "Study together",
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
export const ROOT_PATHS = ["/dashboard", "/classes/manage", "/explore", "/study", "/community", "/profile", "/more", "/saved"];
