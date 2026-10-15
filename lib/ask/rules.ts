import { countLinks } from "@/lib/community/util";

export const ASK_LIMITS = { questionMin: 10, questionMax: 800, replyMin: 2, replyMax: 1500, questionLinks: 1, replyLinks: 2 };

export type Validation = { ok: true; text: string } | { ok: false; message: string };

function validate(raw: string, min: number, max: number, maxLinks: number, label: string): Validation {
  const text = raw.trim().replace(/\n{3,}/g, "\n\n");
  if (text.length < min) return { ok: false, message: `Write at least ${min} characters.` };
  if (text.length > max) return { ok: false, message: `${label} is too long (max ${max} characters).` };
  if (countLinks(text) > maxLinks) return { ok: false, message: `At most ${maxLinks} link${maxLinks === 1 ? "" : "s"} allowed.` };
  // one character repeated over and over is spam
  if (/(.)\1{14,}/.test(text)) return { ok: false, message: "That looks like spam." };
  return { ok: true, text };
}

export const validateQuestion = (t: string) => validate(t, ASK_LIMITS.questionMin, ASK_LIMITS.questionMax, ASK_LIMITS.questionLinks, "Question");
export const validateReply = (t: string) => validate(t, ASK_LIMITS.replyMin, ASK_LIMITS.replyMax, ASK_LIMITS.replyLinks, "Reply");

/** Only the asker may accept an answer, and not their own reply. */
export function canAccept(askerUid: string, callerUid: string, replyAuthorUid: string): boolean {
  return askerUid === callerUid && replyAuthorUid !== callerUid;
}

/** Author info a response may carry: `mine` for the viewer, and the uid for admins only. */
export function publicAuthor(row: { authorUid: string }, viewerUid: string, isAdmin: boolean) {
  return { mine: row.authorUid === viewerUid, ...(isAdmin ? { authorUid: row.authorUid } : {}) };
}
