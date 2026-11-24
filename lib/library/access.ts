import { institutionByName, levelNow, type Academic } from "@/lib/academic/academic";

/** A course rep is a student an admin has trusted to add materials for one department. */
export interface RepScope {
  institutionId: string | null;
  institution: string;
  department: string;
}

export function readRep(user: Record<string, unknown> | undefined): RepScope | null {
  const r = user?.courseRep as Partial<RepScope> | undefined;
  if (!r || typeof r !== "object" || !r.institution || !r.department) return null;
  return { institutionId: typeof r.institutionId === "string" ? r.institutionId : null, institution: String(r.institution), department: String(r.department) };
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const instKey = (id: unknown, name: unknown) => (typeof id === "string" && id ? id : institutionByName(name)?.id ?? norm(name));

export interface LibraryFileLike {
  institutionId?: string | null;
  institution?: string;
  department?: string;
  level?: number | null;
}

/** Whether a rep (or admin) may add to / manage a department's library. */
export function repCovers(rep: RepScope | null, file: LibraryFileLike): boolean {
  if (!rep) return false;
  return instKey(rep.institutionId, rep.institution) === instKey(file.institutionId, file.institution) && norm(rep.department) === norm(file.department);
}

/** A student sees their own department's files, for their level or below (earlier years are useful for revision), and files with no level. */
export function studentCanSee(a: Academic | null, file: LibraryFileLike, now = Date.now()): boolean {
  if (!a) return false;
  if (instKey(a.institutionId, a.institution) !== instKey(file.institutionId, file.institution)) return false;
  if (norm(a.department) !== norm(file.department)) return false;
  return file.level == null || file.level <= levelNow(a, now);
}
