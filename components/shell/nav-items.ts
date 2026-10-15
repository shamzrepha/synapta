import {
  Home,
  GraduationCap,
  BookOpen,
  RotateCw,
  Compass,
  Users,
  MessageSquare,
  User,
  ShieldCheck,
  Newspaper,
  Swords,
  Crown,
  CalendarClock,
  MessageCircle,
  Bookmark,
  Sparkles,
  Wrench,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Array<"student" | "teacher" | "admin">;
  group: "learn" | "social" | "account";
}

const ALL = ["student", "teacher", "admin"] as Array<"student" | "teacher" | "admin">;

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home, roles: ALL, group: "learn" },
  { label: "Classes", href: "/classes/manage", icon: GraduationCap, roles: ALL, group: "learn" },
  { label: "AI Tutor", href: "/tutor", icon: Sparkles, roles: ALL, group: "learn" },
  { label: "Maker Studio", href: "/studio", icon: Wrench, roles: ALL, group: "learn" },
  { label: "Study Hub", href: "/notebook", icon: BookOpen, roles: ALL, group: "learn" },
  { label: "Review", href: "/classes/heatmap", icon: RotateCw, roles: ALL, group: "learn" },
  { label: "Explore", href: "/explore", icon: Compass, roles: ALL, group: "learn" },
  { label: "Community", href: "/feed", icon: Newspaper, roles: ALL, group: "social" },
  { label: "Messages", href: "/messages", icon: MessageCircle, roles: ALL, group: "social" },
  { label: "Challenges", href: "/challenges", icon: Swords, roles: ALL, group: "social" },
  { label: "Leaderboard", href: "/leaderboard", icon: Crown, roles: ALL, group: "social" },
  { label: "Sessions", href: "/sessions", icon: CalendarClock, roles: ALL, group: "social" },
  { label: "Peer Lounge", href: "/lounge", icon: Users, roles: ALL, group: "social" },
  { label: "Friends", href: "/friends", icon: MessageSquare, roles: ALL, group: "social" },
  { label: "Saved", href: "/saved", icon: Bookmark, roles: ALL, group: "account" },
  { label: "Profile", href: "/profile", icon: User, roles: ALL, group: "account" },
  { label: "Admin Console", href: "/admin", icon: ShieldCheck, roles: ["admin"], group: "account" },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}
