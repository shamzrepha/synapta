import fs from "node:fs";
import path from "node:path";

/** Spec 4.5: prepended to every prompt. */
export const UNIVERSAL_PREAMBLE = `You are a precise data-extraction and content-structuring engine inside a learning app.
Output ONLY valid JSON that matches the requested schema. No prose, no markdown fences, no comments.
Never invent facts. Use only the provided SOURCE text unless a field is explicitly marked "ai_added".
Copy source excerpts character-for-character; do not paraphrase inside "excerpt" fields.
If information is missing, use null or an empty array as the schema allows. Do not guess.
Write all learner-facing text in the same language as the SOURCE.
Keep learner-facing sentences short (max 22 words) and concrete.`;

const PROMPT_DIR = () => path.join(process.cwd(), "prompts");
const SECTIONS_SENT = ["Instructions", "Output schema (human summary)", "Few-shot example (input → output)", "Failure modes to avoid"];

/** Highest version of `<name>.v<N>.md`. Prompts live in files, never inline (R15). */
export function findPromptFile(name: string, dir = PROMPT_DIR()): string | null {
  if (!/^[a-z0-9_]+$/i.test(name)) return null;
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const versions = files
    .map((f) => ({ f, m: new RegExp(`^${name}\\.v(\\d+)\\.md$`).exec(f) }))
    .filter((x) => x.m)
    .map((x) => ({ f: x.f, v: Number(x.m![1]) }))
    .sort((a, b) => b.v - a.v);
  return versions.length ? path.join(dir, versions[0].f) : null;
}

/** Splits a prompt file on its "# Heading" lines. */
export function parsePromptSections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;
  for (const line of md.split("\n")) {
    const h = /^#\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = h[1];
      out[current] = "";
    } else if (current) out[current] += line + "\n";
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}

/** The text sent to the model: the sections a model needs, with {{vars}} filled in. A missing variable is a bug, not a blank. */
export function renderPrompt(md: string, vars: Record<string, string>): string {
  const sections = parsePromptSections(md);
  const body = SECTIONS_SENT.filter((s) => sections[s]).map((s) => `## ${s}\n${sections[s]}`).join("\n\n");
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    if (!(key in vars)) throw new Error(`Prompt variable "${key}" was not provided.`);
    return vars[key];
  });
}

export function loadPrompt(name: string, vars: Record<string, string>, dir?: string): string {
  const file = findPromptFile(name, dir);
  if (!file) throw new Error(`Prompt "${name}" was not found in /prompts.`);
  return renderPrompt(fs.readFileSync(file, "utf8"), vars);
}
