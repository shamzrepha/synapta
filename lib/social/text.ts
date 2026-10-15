/** @mentions and #hashtags in posts/comments. Pure so they can be unit tested. */

const MENTION_RE = /(^|[^\w@])@([a-zA-Z0-9_]{3,30})\b/g;
const HASHTAG_RE = /(^|[^\w&#])#([a-zA-Z][a-zA-Z0-9_]{1,39})\b/g;

function stripCode(text: string): string {
  // Ignore anything inside code spans/blocks and LaTeX ($...$) so "#define" or "$a#b$" don't count
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/\$\$?[^$]*\$\$?/g, " ");
}

export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of stripCode(text).matchAll(MENTION_RE)) out.add(m[2].toLowerCase());
  return Array.from(out).slice(0, 10);
}

export function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of stripCode(text).matchAll(HASHTAG_RE)) out.add(m[2].toLowerCase());
  return Array.from(out).slice(0, 10);
}

/** Turns @user and #tag into Markdown links for rendering (outside code/maths). */
export function linkifySocial(text: string): string {
  const parts = text.split(/(```[\s\S]*?```|`[^`]*`|\$\$?[^$]*\$\$?)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // protected segment
      return part
        .replace(MENTION_RE, (_m, pre, user) => `${pre}[@${user}](/u/${user.toLowerCase()})`)
        .replace(HASHTAG_RE, (_m, pre, tag) => `${pre}[#${tag}](/feed?tag=${tag.toLowerCase()})`);
    })
    .join("");
}
