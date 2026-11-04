/**
 * Plans and limits. Shared, already-made content (class lessons, podcasts, quizzes, simulations) is free for everyone because
 * it is made once. What costs money is AI that works for one person: their own notes, scans, lessons, practice sets.
 * Those are counted per month. Limits are only ENFORCED when BILLING_ENFORCED=1; until then usage is counted but nobody is blocked.
 */
export type PlanId = "free" | "plus" | "teacher" | "school";

export const FEATURES = ["notes", "scan_pages", "lessons", "practice", "studio_ai", "class_build"] as const;
export type FeatureKey = (typeof FEATURES)[number];

export const FEATURE_LABEL: Record<FeatureKey, { one: string; many: string }> = {
  notes: { one: "study notes set", many: "study notes sets" },
  scan_pages: { one: "scanned page read", many: "scanned pages read" },
  lessons: { one: "interactive lesson", many: "interactive lessons" },
  practice: { one: "flashcard or quiz set", many: "flashcard and quiz sets" },
  studio_ai: { one: "Maker Studio AI build", many: "Maker Studio AI builds" },
  class_build: { one: "AI class build", many: "AI class builds" },
};

/** Infinity means no cap on that feature (a fair-use token budget still applies). */
export interface Plan {
  id: PlanId;
  label: string;
  blurb: string;
  /** prices in naira; 0 = free. Edit these once real AI costs are known. */
  priceMonthNgn: number;
  priceTermNgn: number;
  monthlyTokens: number;
  perMinute: number;
  limits: Record<FeatureKey, number>;
  perks: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    label: "Free",
    blurb: "Everything your teachers publish, plus a taste of AI for your own notes.",
    priceMonthNgn: 0,
    priceTermNgn: 0,
    monthlyTokens: 50_000,
    perMinute: 10,
    limits: { notes: 3, scan_pages: 15, lessons: 5, practice: 5, studio_ai: 3, class_build: 0 },
    perks: ["Unlimited class lessons, podcasts, quizzes and simulations", "AI tutor with a monthly allowance", "Community, challenges, streaks, Maker Studio"],
  },
  plus: {
    id: "plus",
    label: "Student Plus",
    blurb: "For students who study from their own notes and textbooks.",
    priceMonthNgn: 2_000,
    priceTermNgn: 6_500,
    monthlyTokens: 600_000,
    perMinute: 20,
    limits: { notes: 40, scan_pages: 300, lessons: 60, practice: 60, studio_ai: 30, class_build: 0 },
    perks: ["40 study notes sets and 300 scanned pages a month", "Much bigger AI tutor allowance", "Interactive lessons, flashcards and quizzes on your own notes"],
  },
  teacher: {
    id: "teacher",
    label: "Teacher",
    blurb: "Build whole classes with AI and see who is stuck.",
    priceMonthNgn: 6_000,
    priceTermNgn: 18_000,
    monthlyTokens: 10_000_000,
    perMinute: 60,
    limits: { notes: Infinity, scan_pages: 1_000, lessons: Infinity, practice: Infinity, studio_ai: 100, class_build: 20 },
    perks: ["Build classes from a syllabus with AI", "Class mastery heatmap", "Higher limits for scans and AI builds"],
  },
  school: {
    id: "school",
    label: "School",
    blurb: "For a school or department, billed per seat. Talk to us.",
    priceMonthNgn: 0,
    priceTermNgn: 0,
    monthlyTokens: 10_000_000,
    perMinute: 60,
    limits: { notes: Infinity, scan_pages: 5_000, lessons: Infinity, practice: Infinity, studio_ai: 500, class_build: 100 },
    perks: ["Plus for every student and Teacher for every lecturer", "Admin tools and onboarding", "Invoice instead of card payments"],
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
export const PAYABLE: PlanId[] = ["plus", "teacher"];
export const TERM_DAYS = 120;
export const MONTH_DAYS = 30;

export const billingEnforced = () => process.env.BILLING_ENFORCED === "1";

interface UserLike {
  plan?: unknown;
  planExpiresAt?: unknown;
  role?: unknown;
}

const millis = (v: unknown): number => {
  if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") return (v as { toMillis: () => number }).toMillis();
  if (typeof v === "number") return v;
  if (typeof v === "string") return Date.parse(v) || 0;
  return 0;
};

/** The plan a user is on right now: a paid plan only while it hasn't expired; teachers and admins are at least on Teacher. */
export function planOf(user: UserLike, now = Date.now()): Plan {
  const id = typeof user.plan === "string" && (PLAN_IDS as string[]).includes(user.plan) ? (user.plan as PlanId) : "free";
  const paid = id !== "free" && millis(user.planExpiresAt) > now;
  if (paid) return PLANS[id];
  if (user.role === "teacher" || user.role === "admin") return PLANS.teacher;
  return PLANS.free;
}

export interface Allowance {
  ok: boolean;
  used: number;
  limit: number;
  remaining: number;
}

export function allowance(plan: Plan, usage: Partial<Record<FeatureKey, number>>, feature: FeatureKey, amount = 1): Allowance {
  const limit = plan.limits[feature];
  const used = usage[feature] || 0;
  return { ok: used + amount <= limit, used, limit, remaining: Math.max(0, limit - used) };
}

export function limitMessage(plan: Plan, feature: FeatureKey, a: Allowance): string {
  const name = FEATURE_LABEL[feature].many;
  if (a.limit === 0) return `${plan.label} doesn't include ${name}. Upgrade to use them.`;
  const next = plan.id === "free" ? " Upgrade to Student Plus for more." : "";
  return `You've used all ${a.limit} ${name} for this month on the ${plan.label} plan.${next}`;
}

export const currentPeriod = (now = new Date()) => now.toISOString().slice(0, 7);

export function priceFor(plan: PlanId, term: "month" | "term"): number {
  return term === "term" ? PLANS[plan].priceTermNgn : PLANS[plan].priceMonthNgn;
}

/** New expiry when a payment lands: extends from the current expiry if the plan is still running, else from now. */
export function extendedExpiry(currentExpiryMs: number, term: "month" | "term", now = Date.now()): number {
  const base = currentExpiryMs > now ? currentExpiryMs : now;
  return base + (term === "term" ? TERM_DAYS : MONTH_DAYS) * 86_400_000;
}
