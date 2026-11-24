/**
 * Plans and limits. Shared, already-made content (class lessons, podcasts, quizzes, simulations) is free for everyone because
 * it is made once. What costs money is AI that works for one person: their own notes, scans, lessons, practice sets.
 * Those are counted per month. Limits are only ENFORCED when BILLING_ENFORCED=1; until then usage is counted but nobody is blocked.
 */
export type PlanId = "free" | "exam" | "plus" | "pro" | "promax" | "ultra" | "teacher" | "teacherpro" | "school";

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
  /** School only: naira per student per month */
  perSeatMonthNgn?: number;
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
    label: "Free trial",
    codename: "Seed",
    blurb: "A taste of the AI on your own notes. Classes marked Free stay free; the rest needs the Student plan.",
    priceMonthNgn: 0,
    priceTermNgn: 0,
    monthlyTokens: 100_000,
    perMinute: 10,
    limits: { notes: 3, scan_pages: 15, lessons: 5, practice: 5, studio_ai: 3, class_build: NONE },
    perks: [
      "Unlimited class lessons, podcasts, quizzes and simulations that your teachers publish",
      "7 days from the day you sign up: 3 personal notes sets and 15 scanned pages",
      "5 interactive lessons and 5 flashcard or quiz sets a month",
      "AI tutor with a monthly allowance, community, challenges and streaks",
    ],
  },
  exam: {
    id: "exam",
    retired: true,
    audience: "student",
    label: "Exam Pass",
    codename: "Revision",
    blurb: "1-month intensive pass for past questions, step-by-step worked solutions, examiner traps and twin tests.",
    badge: "Exam month",
    priceMonthNgn: 1_500,
    priceTermNgn: 5_000,
    monthlyTokens: 600_000,
    perMinute: 20,
    limits: { notes: 3, scan_pages: 50, lessons: 20, practice: 100, studio_ai: 3, class_build: NONE },
    perks: [
      "Full Step-by-Step AI Past Question Solver",
      "Worked solutions, examiner traps, tips and formula guides",
      "Unlimited twin practice drills for exam month",
      "30-day exam access",
    ],
  },
  plus: {
    id: "plus",
    audience: "student",
    label: "Student",
    codename: "Sprout",
    blurb: "The one student plan: your own notes, scans, practice and the past-question solver, for the price of a few snacks.",
    badge: "Student plan",
    priceMonthNgn: 1_500,
    priceTermNgn: 4_500,
    monthlyTokens: 1_200_000,
    perMinute: 25,
    limits: { notes: 50, scan_pages: 400, lessons: 80, practice: 150, studio_ai: 40, class_build: NONE },
    perks: [
      "Upload personal notes, slides and scanned textbook pages",
      "Full Step-by-Step AI Past Question Solver and handwritten marking",
      "40 Maker Studio circuit and 3D hardware builds",
      "Sprout Audio Podcasts in local voices",
      "One semester (4.5 months) for ₦4,500, or ₦1,500 a month",
    ],
  },
  pro: {
    id: "pro",
    retired: true,
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
    priceMonthNgn: 2_500,
    priceTermNgn: 7_500,
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
    retired: true,
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
    perSeatTermNgn: 3_700,
    perSeatMonthNgn: 1_200,
    monthlyTokens: 15_000_000,
    perMinute: 60,
    limits: { notes: ALL, scan_pages: 5_000, lessons: ALL, practice: ALL, studio_ai: 500, class_build: 100 },
    perks: ["₦1,200 per student per month or ₦3,700 per semester, or a custom quote for a whole department", "Teacher-level tools for every lecturer", "Direct bank invoice and onboarding"],
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
export const TERM_DAYS = 135;
export const MONTH_DAYS = 30;

/** The plans to show someone: students see the student ladder; teachers and admins see both ladders. */
export function plansForRole(role: unknown): Plan[] {
  const student = PLAN_IDS.filter((id) => PLANS[id].audience === "student" && !PLANS[id].retired).map((id) => PLANS[id]);
  if (role === "teacher" || role === "admin") return [...student, ...PLAN_IDS.filter((id) => PLANS[id].audience !== "student" && !PLANS[id].retired).map((id) => PLANS[id])];
  return student;
}

/** A plan of the teacher ladder can only be bought by a teacher or admin account. */
export function canBuy(plan: PlanId, role: unknown): boolean {
  if (!PAYABLE.includes(plan)) return false;
  return PLANS[plan].audience !== "teacher" || role === "teacher" || role === "admin";
}

/** The student ladder, lowest to highest. Anything from the Exam Pass up has the past-question solver and exam marking. */
export const STUDENT_LADDER: PlanId[] = ["free", "exam", "plus", "pro", "promax", "ultra"];

/** Past-question solver and handwritten marking. Every paid plan at or above the Exam Pass has it, so a higher plan never has less access. */
export function hasExamAccess(planId: string, role?: string): boolean {
  if (role === "teacher" || role === "admin") return true;
  const rank = STUDENT_LADDER.indexOf(planId as PlanId);
  if (rank >= 0) return rank >= STUDENT_LADDER.indexOf("exam");
  const plan = PLANS[planId as PlanId];
  return !!plan && plan.audience !== "student";
}

export const billingEnforced = () => process.env.BILLING_ENFORCED === "1";

interface UserLike {
  plan?: unknown;
  planExpiresAt?: unknown;
  role?: unknown;
  createdAt?: unknown;
}

const millis = (v: unknown): number => {
  if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") return (v as { toMillis: () => number }).toMillis();
  if (typeof v === "number") return v;
  if (typeof v === "string") return Date.parse(v) || 0;
  return 0;
};

/** The free trial lasts this many days from the day the account was made. */
export const TRIAL_DAYS = 7;
/** Accounts made before the trial rule existed get their 7 days counted from this day instead, so nobody is cut off the moment it ships. */
export const TRIAL_RULE_STARTS = Date.parse("2026-11-24T00:00:00Z");

/** When this user's free trial ends (a time in ms). */
export function trialEndsAt(user: UserLike): number {
  const made = millis(user.createdAt);
  return Math.max(made, TRIAL_RULE_STARTS) + TRIAL_DAYS * 86_400_000;
}
export const trialActive = (user: UserLike, now = Date.now()) => now < trialEndsAt(user);

/** After the trial and with no paid plan: classes marked Free still open, but AI that works on your own material needs the Student plan. */
export const TRIAL_ENDED: Plan = {
  ...PLANS.free,
  label: "Trial ended",
  blurb: "Your 7-day free trial is over. Classes marked Free are still open. Get the Student plan for the rest.",
  monthlyTokens: 20_000,
  perMinute: 5,
  limits: { notes: NONE, scan_pages: NONE, lessons: NONE, practice: NONE, studio_ai: NONE, class_build: NONE },
};

/** The plan a user is on right now: a paid plan only while it hasn't expired. Admins get Teacher limits; unpaid teachers get the trial. */
export function planOf(user: UserLike, now = Date.now()): Plan {
  const id = typeof user.plan === "string" && (PLAN_IDS as string[]).includes(user.plan) ? (user.plan as PlanId) : "free";
  const paid = id !== "free" && millis(user.planExpiresAt) > now;
  if (paid) return PLANS[id];
  if (user.role === "admin") return PLANS.teacher; // staff are never limited by a plan they didn't buy
  if (user.role === "teacher") return TEACHER_TRIAL;
  return trialActive(user, now) ? PLANS.free : TRIAL_ENDED;
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
  let t = up;
  while (t && t.limits[feature] <= a.limit) t = nextTier(t);
  const target = t || up;
  return `You've used all ${a.limit} ${name} for this month on the ${plan.label} plan.${target ? ` Upgrade to ${target.label} for more.` : ""}`;
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
