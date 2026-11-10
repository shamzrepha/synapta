/**
 * Remembers the last class payload in the browser (memory, and sessionStorage for reloads) so going back to a page
 * shows it at once while a fresh copy loads quietly in the background.
 */
const mem = new Map<string, unknown>();
const key = (classId: string, lang: string) => `sunroot:class:${classId}:${lang}`;
const MAX_CHARS = 2_500_000;

export function peekClass<T>(classId: string, lang: string): T | null {
  const k = key(classId, lang);
  if (mem.has(k)) return mem.get(k) as T;
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(k) : null;
    if (raw) {
      const v = JSON.parse(raw) as T;
      mem.set(k, v);
      return v;
    }
  } catch {
    /* storage unavailable or damaged: just load */
  }
  return null;
}

export function rememberClass(classId: string, lang: string, payload: unknown): void {
  const k = key(classId, lang);
  mem.set(k, payload);
  try {
    const raw = JSON.stringify(payload);
    if (raw.length <= MAX_CHARS) sessionStorage.setItem(k, raw);
  } catch {
    /* too big for storage: memory copy still works */
  }
}
