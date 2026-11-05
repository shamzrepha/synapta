/** Filtering and ordering for the admin people list, so an admin can browse instead of typing a name. */
export type RoleFilter = "all" | "student" | "teacher" | "admin";
export type PlanFilter = "all" | "free" | "paid" | "gifted" | "trial" | "tester" | "ending";
export type SortKey = "newest" | "name" | "ending" | "xp" | "active";

export const ROLE_FILTERS: RoleFilter[] = ["all", "student", "teacher", "admin"];
export const PLAN_FILTERS: PlanFilter[] = ["all", "free", "paid", "gifted", "trial", "tester", "ending"];
export const SORT_KEYS: SortKey[] = ["newest", "name", "ending", "xp", "active"];

export interface BrowsePerson {
  name: string;
  email: string;
  role: string;
  paid: boolean;
  planExpiresAt: string | null;
  grantKind: string | null;
  isTester: boolean;
  createdAt: number;
  xp: number;
  lastActive: number;
}

const DAY = 86_400_000;

export function matchesFilter(p: BrowsePerson, role: RoleFilter, plan: PlanFilter, now: number): boolean {
  if (role !== "all" && p.role !== role) return false;
  switch (plan) {
    case "all":
      return true;
    case "free":
      return !p.paid;
    case "paid":
      return p.paid && p.grantKind !== "gift" && p.grantKind !== "trial";
    case "gifted":
      return p.paid && p.grantKind === "gift";
    case "trial":
      return p.paid && p.grantKind === "trial";
    case "tester":
      return p.isTester;
    case "ending": {
      const end = p.planExpiresAt ? Date.parse(p.planExpiresAt) : NaN;
      return p.paid && Number.isFinite(end) && end - now <= 7 * DAY;
    }
  }
}

const endMs = (p: BrowsePerson) => (p.planExpiresAt ? Date.parse(p.planExpiresAt) : Number.POSITIVE_INFINITY);

export function sortPeople<T extends BrowsePerson>(list: T[], sort: SortKey): T[] {
  const byName = (a: T, b: T) => (a.name || a.email).localeCompare(b.name || b.email, undefined, { sensitivity: "base" });
  const copy = [...list];
  switch (sort) {
    case "name":
      return copy.sort(byName);
    case "ending":
      return copy.sort((a, b) => endMs(a) - endMs(b) || byName(a, b));
    case "xp":
      return copy.sort((a, b) => b.xp - a.xp || byName(a, b));
    case "active":
      return copy.sort((a, b) => b.lastActive - a.lastActive || byName(a, b));
    case "newest":
    default:
      return copy.sort((a, b) => b.createdAt - a.createdAt || byName(a, b));
  }
}

export function parseFilters(q: URLSearchParams): { role: RoleFilter; plan: PlanFilter; sort: SortKey } {
  const pick = <T extends string>(v: string | null, all: T[], dflt: T): T => (v && (all as string[]).includes(v) ? (v as T) : dflt);
  return { role: pick(q.get("role"), ROLE_FILTERS, "all"), plan: pick(q.get("plan"), PLAN_FILTERS, "all"), sort: pick(q.get("sort"), SORT_KEYS, "newest") };
}
