/** Loads each topic's key-word cards in the background, so tapping a word never waits. */
export interface GlossaryPic {
  url: string;
  page: string;
  title: string;
  author: string;
  license: string;
  source?: string;
}
export interface GlossaryCard {
  term: string;
  summary: string;
  keyPoints: string[];
  example: string;
  imageQuery: string;
  wikipediaTitle?: string;
  /** what the pop-up shows above the text, decided by the AI: a formula, a photo, a diagram or nothing */
  visual?: "photo" | "diagram" | "formula" | "none";
  formula?: string;
  images: GlossaryPic[];
}

const mem = new Map<string, Promise<GlossaryCard[] | null>>();
const skey = (classId: string, kcId: string) => `sunroot:gloss:${classId}:${kcId}`;

const read = (k: string): GlossaryCard[] | null => {
  try {
    const raw = localStorage.getItem(k);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? (v as GlossaryCard[]) : null;
  } catch {
    return null;
  }
};
const write = (k: string, v: GlossaryCard[]) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or unavailable */
  }
};

async function fetchCards(classId: string, kcId: string): Promise<GlossaryCard[] | null> {
  try {
    const res = await fetch("/api/study/glossary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId, kcId }) });
    const j = await res.json();
    if (!j?.ok || j.data?.supported === false || !Array.isArray(j.data?.cards)) return null;
    return j.data.cards as GlossaryCard[];
  } catch {
    return null;
  }
}

/** The cards for a topic: a saved copy straight away (refreshed quietly), otherwise one request shared by every caller. */
export function getGlossary(classId: string, kcId: string): Promise<GlossaryCard[] | null> {
  const k = skey(classId, kcId);
  const hit = mem.get(k);
  if (hit) return hit;
  const seed = read(k);
  const live = fetchCards(classId, kcId).then((cards) => {
    if (cards && cards.length) write(k, cards);
    return cards;
  });
  const p = seed ? Promise.resolve(seed) : live.then((c) => (c && c.length ? c : (mem.delete(k), c)));
  mem.set(k, p);
  if (seed) void live; // refresh the saved copy in the background
  return p;
}

/** Warms the first picture of each card so it is in the browser cache before the learner taps the word. */
export function preloadImages(cards: GlossaryCard[], max = 12): void {
  if (typeof window === "undefined") return;
  const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const run = () => {
    for (const c of cards.slice(0, max)) {
      const u = c.images?.[0]?.url;
      if (u) {
        const img = new Image();
        img.decoding = "async";
        img.src = u;
      }
    }
  };
  const ric = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
  if (ric) ric(run);
  else window.setTimeout(run, 800);
}

/** Prepares many topics quietly, a couple at a time, in the order given. */
export function prefetchGlossaries(classId: string, kcIds: string[], concurrency = 2): () => void {
  let stopped = false;
  let next = 0;
  const worker = async () => {
    while (!stopped && next < kcIds.length) {
      const id = kcIds[next++];
      const cards = await getGlossary(classId, id);
      if (cards?.length) preloadImages(cards, 6);
    }
  };
  for (let i = 0; i < concurrency; i++) void worker();
  return () => {
    stopped = true;
  };
}
