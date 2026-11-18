/**
 * Spreadsheet apps run a cell that starts with one of these as a formula, so a student named `=HYPERLINK(...)` would attack
 * whoever opens the principal's export. (Browser-safe: no server imports here.)
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: formulas are neutralised with a leading apostrophe, then quoted if it has a comma, quote or line break. */
export function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = String(value ?? "");
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
