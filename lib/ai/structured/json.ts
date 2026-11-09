import type { ZodError } from "zod";

/** Removes ```json fences. */
function stripFences(text: string): string {
  return text.replace(/^\s*```(?:json|JSON)?\s*/m, "").replace(/\s*```\s*$/m, "");
}

/**
 * Finds the first complete JSON value in model text: skips any chatter before the first { or [, then brace-matches
 * (respecting strings and escapes) so text after the value is ignored. Not a greedy regex (spec 4.2 step 4).
 */
export function extractJsonText(raw: string): string | null {
  const text = stripFences(raw);
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseJsonLoose(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const body = extractJsonText(raw);
  if (!body) return { ok: false, error: "No JSON object or array found in the output." };
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
}

/** "units.2.source.excerpt: Required" lines for the repair prompt. */
export function describeZodError(err: ZodError, max = 12): string {
  return err.issues
    .slice(0, max)
    .map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("\n");
}

export function buildRepairPrompt(previousOutput: string, problem: string): string {
  return `Your previous answer could not be used.\n\nPROBLEM:\n${problem}\n\nYOUR PREVIOUS ANSWER:\n${previousOutput.slice(0, 12_000)}\n\nReturn the corrected answer now: ONLY valid JSON that fixes every problem listed. Keep everything that was already correct.`;
}
