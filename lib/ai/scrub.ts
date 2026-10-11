/**
 * PII Scrubber for AI Ingestion Pipelines.
 * Redacts emails, phone numbers, student IDs, and identifying numbers
 * before prompt payload transmission to Gemini.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const STUDENT_ID_REGEX = /\b(?:student\s*id|id|matric|matriculation|reg\s*no)[:#\s]+([A-Za-z0-9_-]{5,20})\b/gi;

export function scrubPii(text: string): string {
  if (!text || typeof text !== "string") return "";

  // 1. Temporarily protect LaTeX equations so STEM math formulas are never altered
  const mathPlaceholders: string[] = [];
  const withProtectedMath = text.replace(
    /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\(.+?\\\)|\\\[[\s\S]+?\\\])/g,
    (match) => {
      const idx = mathPlaceholders.length;
      mathPlaceholders.push(match);
      return `___MATH_BLOCK_${idx}___`;
    }
  );

  // 2. Perform STEM-safe redaction
  let scrubbed = withProtectedMath
    .replace(EMAIL_REGEX, "[REDACTED_EMAIL]")
    .replace(SSN_REGEX, "[REDACTED_SSN]")
    .replace(STUDENT_ID_REGEX, (_match, id) => _match.replace(id, "[REDACTED_ID]"))
    .replace(PHONE_REGEX, "[REDACTED_PHONE]");

  // 3. Restore protected math blocks
  mathPlaceholders.forEach((math, idx) => {
    scrubbed = scrubbed.replace(`___MATH_BLOCK_${idx}___`, () => math);
  });

  return scrubbed;
}

/**
 * Sanitizes untrusted user-supplied or uploaded document content before prompting Gemini.
 * Strips script tags, HTML markup, caps size, and applies PII redaction.
 */
export function sanitizeUntrustedPromptText(text: string, maxChars = 30000): string {
  if (!text) return "";

  // 1. Strip raw script and iframe tags
  let cleaned = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");

  // 2. Scrub PII
  cleaned = scrubPii(cleaned);

  // 3. Cap length
  if (cleaned.length > maxChars) {
    cleaned = cleaned.slice(0, maxChars) + "\n\n[Content truncated for analysis]";
  }

  return cleaned.trim();
}
