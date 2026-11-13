import { perchOnWord, hopMs, hopPath, type Box } from "@/lib/pet/read-hop";
import { alignSpoken, splitDomWords } from "@/lib/study/word-sync";
import { wordAt, type WordTiming } from "@/lib/voice/word-timing";
import type { BotApi } from "@/components/bot/bot-provider";

interface DomWord {
  word: string;
  node: Text;
  start: number;
  end: number;
}

/** Every word on the page inside `root`, in reading order (math's hidden copy and buttons are left out). */
function pageWords(root: HTMLElement): DomWord[] {
  const out: DomWord[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest(".katex-mathml, script, style, button, [aria-hidden='true']")) return NodeFilter.FILTER_REJECT;
      return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    for (const w of splitDomWords(t.nodeValue || "")) out.push({ word: w.word, node: t, start: w.start, end: w.end });
  }
  return out;
}

const hasHighlights = (): boolean => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

function setHighlight(name: string, range: Range | null) {
  if (!hasHighlights()) return;
  if (range) CSS.highlights.set(name, new Highlight(range));
  else CSS.highlights.delete(name);
}

export function clearReadingHighlights() {
  setHighlight("sprout-word", null);
  setHighlight("sprout-line", null);
}

export interface Follower {
  stop: () => void;
  /** where the next piece of the same paragraph should start looking */
  next: number;
}

/**
 * While a passage is read: lights the word being said (and, softly, its line) and walks Sprout along the words, standing on the one
 * being said and hopping on to the next. Every hop starts where Sprout really is, so it never snaps.
 */
export function followReading(opts: { audio: HTMLAudioElement; words: WordTiming[]; root: HTMLElement; from: number; bot: BotApi }): Follower {
  const { audio, words, root, bot } = opts;
  const dom = pageWords(root);
  const { map, next } = alignSpoken(words.map((w) => w.t), dom.map((d) => d.word), opts.from);
  const follower: Follower = { stop: () => {}, next };
  let raf = 0;
  let last = -2;
  let lastLineTop = -1;
  let lastScroll = 0;
  let want: { x: number; y: number; ms: number } | null = null;
  let hopping = false;
  let off = false;

  const boxOf = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });

  const runHops = async () => {
    hopping = true;
    while (want && !off) {
      const t = want;
      want = null;
      const from = bot.where();
      const path = hopPath(from, { x: t.x, y: t.y });
      await bot.path(path, { duration: t.ms, pose: "idle" });
    }
    hopping = false;
  };

  const lineOf = (j: number): Range | null => {
    const top = (() => {
      const r = document.createRange();
      r.setStart(dom[j].node, dom[j].start);
      r.setEnd(dom[j].node, dom[j].end);
      return r.getBoundingClientRect().top;
    })();
    let a = j;
    let b = j;
    const topOf = (k: number) => {
      const r = document.createRange();
      r.setStart(dom[k].node, dom[k].start);
      r.setEnd(dom[k].node, dom[k].end);
      return r.getBoundingClientRect().top;
    };
    while (a > 0 && Math.abs(topOf(a - 1) - top) < 4) a--;
    while (b < dom.length - 1 && Math.abs(topOf(b + 1) - top) < 4) b++;
    const range = document.createRange();
    range.setStart(dom[a].node, dom[a].start);
    range.setEnd(dom[b].node, dom[b].end);
    lastLineTop = top;
    return range;
  };

  const rectOfWord = (j: number): DOMRect => {
    const r = document.createRange();
    r.setStart(dom[j].node, dom[j].start);
    r.setEnd(dom[j].node, dom[j].end);
    return r.getBoundingClientRect();
  };
  /** the page word for spoken word `idx`, or the next one that lines up (a spelled-out symbol has none of its own) */
  const pageIndex = (idx: number): number => {
    for (let i = idx; i < Math.min(words.length, idx + 4); i++) if (map[i] >= 0 && dom[map[i]]) return map[i];
    return -1;
  };

  let lastLead = -2;
  const step = () => {
    if (off) return;
    raf = requestAnimationFrame(step);
    const ms = audio.currentTime * 1000;

    // the word being said glows
    const idx = wordAt(words, ms);
    if (idx !== last && idx >= 0) {
      last = idx;
      const j = map[idx];
      if (j >= 0 && dom[j]) {
        const range = document.createRange();
        range.setStart(dom[j].node, dom[j].start);
        range.setEnd(dom[j].node, dom[j].end);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          setHighlight("sprout-word", range);
          if (Math.abs(rect.top - lastLineTop) > 4) setHighlight("sprout-line", lineOf(j));
          // keep the line being read comfortably in view
          const now = performance.now();
          if (now - lastScroll > 700 && (rect.top < 110 || rect.bottom > window.innerHeight - 150)) {
            lastScroll = now;
            window.scrollBy({ top: rect.top - window.innerHeight * 0.4, behavior: "smooth" });
          }
        }
      }
    }

    // Sprout is a little ahead of the voice, so it has landed on a word by the time it is said (even at the start of a new line)
    const lead = wordAt(words, ms + 190);
    if (lead !== lastLead && lead >= 0) {
      lastLead = lead;
      const j = pageIndex(lead);
      if (j >= 0) {
        const to = perchOnWord(boxOf(rectOfWord(j)), { width: window.innerWidth, height: window.innerHeight });
        const from = bot.where();
        if (Math.hypot(to.x - from.x, to.y - from.y) > 1.5) {
          want = { x: to.x, y: to.y, ms: hopMs(from, to, Math.max(120, words[lead].e - words[lead].s)) };
          if (!hopping) void runHops();
        }
      }
    }
  };
  raf = requestAnimationFrame(step);

  follower.stop = () => {
    off = true;
    want = null;
    cancelAnimationFrame(raf);
    clearReadingHighlights();
  };
  return follower;
}
