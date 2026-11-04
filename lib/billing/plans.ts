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
  /** price for one semester (120 days) */
  priceTermNgn: number;
  /** School only: naira per student per semester, billed by invoice */
  perSeatTermNgn?: number;
  monthlyTokens: number;
  perMinute: number;
  limits: Record<FeatureKey, number>;
  perks: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    label: "Free",
    blurb: "Everything your lecturers publish, plus a taste of AI for your own notes.",
    priceMonthNgn: 0,
    priceTermNgn: 0,
    monthlyTokens: 100_000,
    perMinute: 10,
    limits: { notes: 3, scan_pages: 15, lessons: 5, practice: 5, studio_ai: 3, class_build: 0 },
    perks: [
      "Unlimited class lessons, podcasts, quizzes and simulations that your teachers publish",
      "3 personal notes sets and 15 scanned pages a month",
      "5 interactive lessons and 5 flashcard or quiz sets a month",
      "AI tutor with a monthly allowance, community, challenges and streaks",
    ],
  },
  plus: {
    id: "plus",
    label: "Student Plus",
    blurb: "For students revising from their own handouts, scans and textbooks.",
    priceMonthNgn: 2_500,
    priceTermNgn: 6_000,
    monthlyTokens: 1_200_000,
    perMinute: 20,
    limits: { notes: 50, scan_pages: 400, lessons: 80, practice: 80, studio_ai: 40, class_build: 0 },
    perks: [
      "50 personal notes sets a month",
      "400 scanned or handwritten pages a month, read by AI vision",
      "80 interactive lessons and 80 flashcard and quiz sets a month",
      "40 Maker Studio circuit and C++ builds a month",
      "A much bigger AI tutor allowance",
    ],
  },
  teacher: {
    id: "teacher",
    label: "Teacher",
    blurb: "For lecturers, graduate assistants and secondary STEM teachers.",
    priceMonthNgn: 7_500,
    priceTermNgn: 20_000,
    monthlyTokens: 15_000_000,
    perMinute: 60,
    limits: { notes: Infinity, scan_pages: 1_500, lessons: Infinity, practice: Infinity, studio_ai: 150, class_build: 25 },
    perks: [
      "25 full AI syllabus-to-class builds a month",
      "Unlimited notes, interactive lessons and practice sets",
      "1,500 scanned pages and 150 circuit and robotics builds a month",
      "Class mastery heatmap, grading help, and podcasts in English, Pidgin, Igbo and Hausa (Yorùbá voice is in beta)",
    ],
  },
  school: {
    id: "school",
    label: "School / Department",
    blurb: "For a university department or school, billed by invoice per student.",
    priceMonthNgn: 0,
    priceTermNgn: 0,
    perSeatTermNgn: 1_200,
    monthlyTokens: 15_000_000,
    perMinute: 60,
    limits: { notes: Infinity, scan_pages: 5_000, lessons: Infinity, practice: Infinity, studio_ai: 500, class_build: 100 },
    perks: ["₦1,200 per student per semester, or a custom quote for a whole department", "Teacher-level tools for every lecturer", "Direct bank invoice and onboarding"],
  },
};

/**
 * What a teacher gets before paying, so a lecturer can try building a class first: Free's personal limits plus a couple of
 * AI class builds and a bigger AI budget. Change these two numbers to tighten or loosen the trial.
 */
export const TEACHER_TRIAL: Plan = {
  ...PLANS.free,
  label: "Free (teacher trial)",
  blurb: "Try building a class with AI before you subscribe.",
  monthlyTokens: 1_000_000,
  perMinute: 30,
  limits: { ...PLANS.free.limits, class_build: 2 },
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

/** The plan a user is on right now: a paid plan only while it hasn't expired. Admins get Teacher limits; unpaid teachers get the trial. */
export function planOf(user: UserLike, now = Date.now()): Plan {
  const id = typeof user.plan === "string" && (PLAN_IDS as string[]).includes(user.plan) ? (user.plan as PlanId) : "free";
  const paid = id !== "free" && millis(user.planExpiresAt) > now;
  if (paid) return PLANS[id];
  if (user.role === "admin") return PLANS.teacher; // staff are never limited by a plan they didn't buy
  if (user.role === "teacher") return TEACHER_TRIAL;
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

/** How much cheaper a semester is than four months paid monthly, as a whole percent (what the "Save x%" label shows). */
export function termSavingsPercent(plan: Pick<Plan, "priceMonthNgn" | "priceTermNgn">): number {
  const fourMonths = plan.priceMonthNgn * 4;
  return fourMonths > 0 && plan.priceTermNgn < fourMonths ? Math.round((1 - plan.priceTermNgn / fourMonths) * 100) : 0;
}
