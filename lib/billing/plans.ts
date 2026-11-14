/**
 * Plans and limits. Shared, already-made content (class lessons, podcasts, quizzes, simulations) is free for everyone because
 * it is made once. What costs money is AI that works for one person: their own notes, scans, lessons, practice sets.
 * Those are counted per month. Limits are only ENFORCED when BILLING_ENFORCED=1; until then usage is counted but nobody is blocked.
 */
export type PlanId = "free" | "plus" | "pro" | "promax" | "ultra" | "teacher" | "teacherpro" | "school";

/** Who a plan is for. A student's plans and a teacher's plans are separate ladders, like most subscription sites. */
export type Audience = "student" | "teacher" | "school";

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
  audience: Audience;
  label: string;
  /** a short, memorable name shown beside the label */
  codename: string;
  blurb: string;
  /** shown as a ribbon on the card */
  badge?: string;
  /** no longer sold or shown, but people who already hold it keep it until it expires */
  retired?: boolean;
  /** prices in naira; 0 = free. Edit these once real AI costs are known. */
  priceMonthNgn: number;
  /** price for one semester: 4 months (120 days), a Nigerian university semester, at about 3 months' price */
  priceTermNgn: number;
  /** School only: naira per student per semester, billed by invoice */
  perSeatTermNgn?: number;
  monthlyTokens: number;
  /** AI requests allowed per minute: higher plans are faster when many things happen at once */
  perMinute: number;
  limits: Record<FeatureKey, number>;
  perks: string[];
}

const NONE = 0;
const ALL = Infinity;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    audience: "student",
    label: "Free",
    codename: "Seed",
    blurb: "Everything your lecturers publish, plus a taste of AI for your own notes.",
    priceMonthNgn: 0,
    priceTermNgn: 0,
    monthlyTokens: 100_000,
    perMinute: 10,
    limits: { notes: 3, scan_pages: 15, lessons: 5, practice: 5, studio_ai: 3, class_build: NONE },
    perks: [
      "Unlimited class lessons, podcasts, quizzes and simulations that your teachers publish",
      "3 personal notes sets and 15 scanned pages a month",
      "5 interactive lessons and 5 flashcard or quiz sets a month",
      "AI tutor with a monthly allowance, community, challenges and streaks",
    ],
  },
  plus: {
    id: "plus",
    audience: "student",
    label: "Plus",
    codename: "Sprout",
    blurb: "For students revising from their own handouts, scans and textbooks.",
    priceMonthNgn: 3_500,
    priceTermNgn: 11_000,
    monthlyTokens: 1_200_000,
    perMinute: 20,
    limits: { notes: 50, scan_pages: 400, lessons: 80, practice: 80, studio_ai: 40, class_build: NONE },
    perks: ["50 personal notes sets a month", "400 scanned or handwritten pages a month", "80 interactive lessons and 80 flashcard and quiz sets", "40 Maker Studio circuit and C++ builds", "A much bigger AI tutor allowance"],
  },
  pro: {
    id: "pro",
    audience: "student",
    label: "Pro",
    codename: "Sapling",
    blurb: "For serious exam seasons: three times the room of Plus.",
    badge: "Most popular",
    priceMonthNgn: 6_000,
    priceTermNgn: 19_000,
    monthlyTokens: 3_000_000,
    perMinute: 30,
    limits: { notes: 150, scan_pages: 1_000, lessons: 250, practice: 250, studio_ai: 120, class_build: NONE },
    perks: ["150 personal notes sets a month", "1,000 scanned pages a month", "250 interactive lessons and 250 flashcard and quiz sets", "120 Maker Studio builds", "Faster AI when you study several things at once"],
  },
  promax: {
    id: "promax",
    retired: true,
    audience: "student",
    label: "Pro Max",
    codename: "Canopy",
    blurb: "For final-year projects, thesis reading and heavy courseloads.",
    priceMonthNgn: 9_000,
    priceTermNgn: 21_000,
    monthlyTokens: 8_000_000,
    perMinute: 45,
    limits: { notes: 400, scan_pages: 2_500, lessons: 600, practice: 600, studio_ai: 300, class_build: NONE },
    perks: ["400 personal notes sets a month", "2,500 scanned pages: whole textbooks", "600 interactive lessons and 600 flashcard and quiz sets", "300 Maker Studio builds", "Priority speed for AI requests"],
  },
  ultra: {
    id: "ultra",
    retired: true,
    audience: "student",
    label: "Ultra",
    codename: "Grove",
    blurb: "No ceilings to think about. Everything at the highest allowance.",
    badge: "Best value per semester",
    priceMonthNgn: 15_000,
    priceTermNgn: 34_000,
    monthlyTokens: 20_000_000,
    perMinute: 60,
    limits: { notes: ALL, scan_pages: 6_000, lessons: ALL, practice: ALL, studio_ai: 1_000, class_build: NONE },
    perks: ["Unlimited notes, interactive lessons and practice sets (fair use)", "6,000 scanned pages a month", "1,000 Maker Studio builds", "The fastest AI speed and the biggest tutor allowance"],
  },
  teacher: {
    id: "teacher",
    audience: "teacher",
    label: "Teacher",
    codename: "Root",
    blurb: "For lecturers, graduate assistants and secondary STEM teachers.",
    priceMonthNgn: 7_500,
    priceTermNgn: 20_000,
    monthlyTokens: 15_000_000,
    perMinute: 60,
    limits: { notes: ALL, scan_pages: 1_500, lessons: ALL, practice: ALL, studio_ai: 150, class_build: 25 },
    perks: [
      "25 full AI syllabus-to-class builds a month",
      "Unlimited notes, interactive lessons and practice sets",
      "1,500 scanned pages and 150 circuit and robotics builds a month",
      "Class mastery heatmap, grading help, and podcasts in English, Pidgin, Igbo and Hausa (Yorùbá voice is in beta)",
    ],
  },
  teacherpro: {
    id: "teacherpro",
    audience: "teacher",
    label: "Teacher Pro",
    codename: "Taproot",
    blurb: "For lecturers who run several courses or a whole department's materials.",
    badge: "Most popular",
    priceMonthNgn: 15_000,
    priceTermNgn: 40_000,
    monthlyTokens: 40_000_000,
    perMinute: 90,
    limits: { notes: ALL, scan_pages: 4_000, lessons: ALL, practice: ALL, studio_ai: 400, class_build: 80 },
    perks: ["80 AI class builds a month", "4,000 scanned pages: whole course packs at once", "400 circuit and robotics builds a month", "The fastest AI speed and the biggest budget"],
  },
  school: {
    id: "school",
    audience: "school",
    label: "School / Department",
    codename: "Forest",
    blurb: "For a university department or school, billed by invoice per student.",
    priceMonthNgn: 0,
    priceTermNgn: 0,
    perSeatTermNgn: 1_200,
    monthlyTokens: 15_000_000,
    perMinute: 60,
    limits: { notes: ALL, scan_pages: 5_000, lessons: ALL, practice: ALL, studio_ai: 500, class_build: 100 },
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
  codename: "Seed",
  blurb: "Try building a class with AI before you subscribe.",
  monthlyTokens: 1_000_000,
  perMinute: 30,
  limits: { ...PLANS.free.limits, class_build: 2 },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
/** Plans that can be bought online. School is invoiced, Free is free. */
export const PAYABLE: PlanId[] = PLAN_IDS.filter((id) => PLANS[id].audience !== "school" && PLANS[id].priceMonthNgn > 0);
export const TERM_DAYS = 120;
export const MONTH_DAYS = 30;

/** The plans to show someone: students see the student ladder; teachers and admins see both ladders. */
export function plansForRole(role: unknown): Plan[] {
  const student = PLAN_IDS.filter((id) => PLANS[id].audience === "student" && !PLANS[id].retired).map((id) => PLANS[id]);
  if (role === "teacher" || role === "admin") return [...student, ...PLAN_IDS.filter((id) => PLANS[id].audience !== "student").map((id) => PLANS[id])];
  return student;
}

/** A plan of the teacher ladder can only be bought by a teacher or admin account. */
export function canBuy(plan: PlanId, role: unknown): boolean {
  if (!PAYABLE.includes(plan)) return false;
  return PLANS[plan].audience !== "teacher" || role === "teacher" || role === "admin";
}

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

/** The next plan up on the same ladder (Free to Plus to Pro...), or null at the top. A teacher's trial moves up to Teacher. */
export function nextTier(plan: Plan): Plan | null {
  if (plan.id === TEACHER_TRIAL.id && plan.label === TEACHER_TRIAL.label) return PLANS.teacher;
  const ladder = PLAN_IDS.filter((id) => PLANS[id].audience === plan.audience && !PLANS[id].retired && (PLANS[id].priceMonthNgn > 0 || id === "free")).sort((a, b) => PLANS[a].priceMonthNgn - PLANS[b].priceMonthNgn);
  const i = ladder.indexOf(plan.id);
  return i >= 0 && i < ladder.length - 1 && PLANS[ladder[i + 1]].audience !== "school" ? PLANS[ladder[i + 1]] : null;
}

export function limitMessage(plan: Plan, feature: FeatureKey, a: Allowance): string {
  const name = FEATURE_LABEL[feature].many;
  const up = nextTier(plan);
  if (a.limit === 0) {
    // the first plan above this one that actually includes the feature (students' plans never include class building)
    let t = up;
    while (t && t.limits[feature] === 0) t = nextTier(t);
    return t ? `${plan.label} doesn't include ${name}. Upgrade to ${t.label} to use them.` : `${plan.label} doesn't include ${name}. They are for teacher accounts.`;
  }
  return `You've used all ${a.limit} ${name} for this month on the ${plan.label} plan.${up ? ` Upgrade to ${up.label} for more.` : ""}`;
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
