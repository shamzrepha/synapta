/** Cleans untrusted AI output into flashcards (pure). */
export interface GeneratedCard {
  front: string;
  back: string;
}

export function cleanCards(raw: Array<{ front?: unknown; back?: unknown }>, max: number): GeneratedCard[] {
  const seen = new Set<string>();
  const out: GeneratedCard[] = [];
  for (const c of raw) {
    const front = typeof c.front === "string" ? c.front.trim().slice(0, 300) : "";
    const back = typeof c.back === "string" ? c.back.trim().slice(0, 600) : "";
    if (front.length < 3 || back.length < 1) continue;
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ front, back });
    if (out.length >= max) break;
  }
  return out;
}
