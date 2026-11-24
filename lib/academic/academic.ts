import { FUTO_MAX_LEVEL, FUTO_SCHOOLS, FUTO_VERIFIED, type SchoolDef } from "./futo";

/** What a student has told us about where and what they study. Set once, then locked. */
export interface Academic {
  /** known institutions have a catalog id ("futo"); any other school is typed or picked from the schools list and has none */
  institutionId: string | null;
  institution: string;
  /** the school / faculty inside the institution, when the catalog has them */
  school: string;
  department: string;
  /** the level when it was set: 100, 200 ... */
  level: number;
  /** when that level was set (ms), so the level can move up by itself each academic year */
  levelSetAt: number;
  lockedAt: number;
}

export interface Institution {
  id: string;
  name: string;
  aliases: string[];
  maxLevel: number;
  schools: SchoolDef[];
  /** false until the lists were checked against the institution's own pages */
  verified: boolean;
}

export const INSTITUTIONS: Institution[] = [
  { id: "futo", name: "Federal University of Technology, Owerri (FUTO)", aliases: ["futo", "federal university of technology owerri", "federal university of technology, owerri"], maxLevel: FUTO_MAX_LEVEL, schools: FUTO_SCHOOLS, verified: FUTO_VERIFIED },
];

export const DEFAULT_MAX_LEVEL = 600;
export const LEVELS = [100, 200, 300, 400, 500, 600];

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const institutionById = (id: unknown) => INSTITUTIONS.find((i) => i.id === id) ?? null;

/** Finds a catalog institution from whatever name a student or a class has for it. */
export function institutionByName(name: unknown): Institution | null {
  const n = norm(name);
  if (!n) return null;
  return INSTITUTIONS.find((i) => norm(i.name) === n || i.aliases.some((a) => norm(a) === n)) ?? null;
}

/** First day of the academic year (month is 0-based: 9 = October). Used to move a student up a level each session. */
export const ACADEMIC_YEAR_START_MONTH = 9;

/** How many academic years have started between two moments. */
export function sessionsBetween(fromMs: number, toMs: number): number {
  const start = (ms: number) => {
    const d = new Date(ms);
    return d.getUTCMonth() >= ACADEMIC_YEAR_START_MONTH ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  };
  return Math.max(0, start(toMs) - start(fromMs));
}

/** The level a student is at today: the level they set, plus one for every new academic year since, up to the programme's last year. */
export function levelNow(a: Pick<Academic, "level" | "levelSetAt" | "institutionId">, now = Date.now()): number {
  const max = institutionById(a.institutionId)?.maxLevel ?? DEFAULT_MAX_LEVEL;
  return Math.min(max, a.level + sessionsBetween(a.levelSetAt, now) * 100);
}

export interface AcademicInput {
  institutionId?: string | null;
  institution: string;
  school?: string;
  department: string;
  level: number;
}

export type Checked = { ok: true; value: Omit<Academic, "levelSetAt" | "lockedAt"> } | { ok: false; message: string };

/** Checks a student's answers. For a catalog institution the school and department must be real choices from its list. */
export function checkAcademic(i: AcademicInput): Checked {
  if (!LEVELS.includes(i.level)) return { ok: false, message: "Pick your level." };
  const inst = institutionById(i.institutionId) ?? null;
  if (inst) {
    if (i.level > inst.maxLevel) return { ok: false, message: `${inst.name} goes up to ${inst.maxLevel} level.` };
    const school = inst.schools.find((s) => s.name === i.school || s.id === i.school);
    if (!school) return { ok: false, message: "Pick your school." };
    const dep = school.departments.find((d) => norm(d) === norm(i.department));
    if (!dep) return { ok: false, message: "Pick your department from the list." };
    return { ok: true, value: { institutionId: inst.id, institution: inst.name, school: school.name, department: dep, level: i.level } };
  }
  const institution = i.institution.trim();
  const department = i.department.trim();
  if (institution.length < 2) return { ok: false, message: "Tell us your school." };
  if (department.length < 2) return { ok: false, message: "Tell us your department." };
  return { ok: true, value: { institutionId: null, institution: institution.slice(0, 100), school: (i.school || "").trim().slice(0, 100), department: department.slice(0, 100), level: i.level } };
}

/** What a class says about who it is for. Every part is optional; an empty part means "anyone". */
export interface ClassAudience {
  institution?: unknown;
  department?: unknown;
  levels?: unknown;
  /** a class a lecturer marks as open to every student, whatever their school */
  open?: unknown;
}

/**
 * Whether a student may see (and join without an invite code) a class. A class with no institution is not shown to a student who has
 * set their course, unless the lecturer marked it open. Departments and levels narrow it further when the class names them.
 */
export function eligibleFor(c: ClassAudience, a: Academic | null, now = Date.now()): boolean {
  if (!a) return true; // no course set yet: nothing to filter by
  if (c.open === true) return true;
  const cInst = institutionByName(c.institution)?.id ?? norm(c.institution);
  const aInst = a.institutionId ?? norm(a.institution);
  if (!cInst || cInst !== aInst) return false;
  const dep = norm(c.department);
  if (dep && dep !== norm(a.department)) return false;
  const levels = Array.isArray(c.levels) ? (c.levels as unknown[]).filter((x): x is number => typeof x === "number") : [];
  if (levels.length > 0 && !levels.includes(levelNow(a, now))) return false;
  return true;
}
