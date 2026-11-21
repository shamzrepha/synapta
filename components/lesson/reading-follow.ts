import { perchOnWord, type Box } from "@/lib/pet/read-hop";
import { leadClipMs } from "@/lib/pet/read-timing";
import { alignSpoken, splitDomWords } from "@/lib/study/word-sync";
import { wordAt, type WordTiming } from "@/lib/voice/word-timing";
import type { BotApi } from "@/components/bot/bot-provider";

interface DomWord {
  word: string;
  node: Text;
  start: number;
  end: number;
}

/** Every word on the page inside `root`, in reading order (math's hidden copy and UI action buttons are left out, while inline `.note-term` glossary words are kept). */
function pageWords(root: HTMLElement): DomWord[] {
  const out: DomWord[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest(".katex-mathml, script, style, button:not(.note-term), [data-no-read], [aria-hidden='true']")) return NodeFilter.FILTER_REJECT;
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
 * being said and hopping on to the next. Every hop starts where Sprout really is, so it never snaps, and between hops Sprout stays on
 * its word while the page scrolls. If the page redraws its text (the old words are gone), the words are found again and it carries on.
 */
export function followReading(opts: {
  audio: HTMLAudioElement;
  words: WordTiming[];
  root: HTMLElement;
  from: number;
  bot: BotApi;
  /** called once when the paragraph is no longer on the page, so the caller can find it again and start a new follower */
  onLost?: () => void;
}): Follower {
  const { audio, words, root, bot } = opts;
  let dom = pageWords(root);
  /** matches the spoken words to page words; when too few line up (the voice reads very differently from the page) the words are spread evenly instead */
  const align = (from: number) => {
    const r = alignSpoken(words.map((w) => w.t), dom.map((d) => d.word), from);
    const hits = r.map.filter((m) => m >= 0).length;
    if (dom.length > 0 && words.length > 0 && hits < words.length * 0.5) {
      r.map = words.map((_, i) => Math.min(dom.length - 1, Math.floor((i * dom.length) / words.length)));
    }
    return r;
  };
  let { map, next } = align(opts.from);
  const follower: Follower = { stop: () => {}, next };
  let raf = 0;
  let last = -2;
  let lastDomIdx = -1;
  let lastScroll = 0;
  let off = false;
  let lost = false;
  /** where Sprout is drawn this frame, and when the last frame ran */
  let pos: { x: number; y: number } | null = null;
  let lastFrame = performance.now();

  const boxOf = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });

  const rangeOf = (j: number): Range => {
    const r = document.createRange();
    r.setStart(dom[j].node, dom[j].start);
    r.setEnd(dom[j].node, dom[j].end);
    return r;
  };
  const rectOfWord = (j: number): DOMRect => rangeOf(j).getBoundingClientRect();

  const lineOf = (j: number): Range => {
    const rect = rectOfWord(j);
    const midY = rect.top + rect.height / 2;
    const tol = Math.max(8, rect.height * 0.55);
    const sameRow = (k: number) => {
      const r = rectOfWord(k);
      return Math.abs(r.top + r.height / 2 - midY) <= tol;
    };
    let a = j;
    let b = j;
    while (a > 0 && sameRow(a - 1)) a--;
    while (b < dom.length - 1 && sameRow(b + 1)) b++;
    const range = document.createRange();
    range.setStart(dom[a].node, dom[a].start);
    range.setEnd(dom[b].node, dom[b].end);
    return range;
  };

  /**
   * The page word for spoken word `idx`. A spoken word with no match of its own (a spelled-out symbol, a number said in words) takes the
   * next one that lines up, or else a place just after the last word that did, so Sprout keeps walking instead of freezing.
   */
  const pageIndex = (idx: number): number => {
    for (let i = idx; i < Math.min(words.length, idx + 4); i++) if (map[i] >= 0 && dom[map[i]]) return map[i];
    for (let i = idx - 1; i >= Math.max(0, idx - 12); i--) {
      if (map[i] >= 0 && dom[map[i]]) return Math.min(dom.length - 1, map[i] + (idx - i));
    }
    return -1;
  };

  /** the words on the page were redrawn: find them again, or tell the caller if the paragraph itself is gone */
  const recover = (): boolean => {
    if (!root.isConnected) {
      if (!lost) {
        lost = true;
        opts.onLost?.();
      }
      return false;
    }
    dom = pageWords(root);
    const again = align(0);
    map = again.map;
    next = again.next;
    follower.next = next;
    last = -2;
    lastDomIdx = -1;
    return dom.length > 0;
  };

  const step = () => {
    if (off) return;
    raf = requestAnimationFrame(step);
    try {
      if (dom.length === 0 || !dom[0].node.isConnected) {
        if (!recover()) return;
      }
      const ms = audio.currentTime * 1000;

      // the word being said glows
      const idx = wordAt(words, ms);
      if (idx !== last && idx >= 0) {
        last = idx;
        const j = pageIndex(idx);
        if (j >= 0 && dom[j] && j !== lastDomIdx) {
          lastDomIdx = j;
          const range = rangeOf(j);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 || rect.height > 0) {
            setHighlight("sprout-word", range);
            setHighlight("sprout-line", lineOf(j));
            // keep the line being read comfortably in view
            const now = performance.now();
            if (now - lastScroll > 700 && (rect.top < 110 || rect.bottom > window.innerHeight - 150)) {
              lastScroll = now;
              window.scrollBy({ top: rect.top - window.innerHeight * 0.4, behavior: "smooth" });
            }
          }
        }
      }

      // Sprout glides along the words: every frame it is eased toward a point that moves with the voice, a little ahead of it.
      // (Per-word hops could not keep up with a fast voice: each new hop restarted an animation. A point that glides never falls behind.)
      const t = ms + leadClipMs(audio.playbackRate);
      const L = ms < 40 ? 0 : wordAt(words, t);
      if (L >= 0) {
        const jL = pageIndex(L);
        if (jL >= 0 && dom[jL]) {
          const viewport = { width: window.innerWidth, height: window.innerHeight };
          const a = perchOnWord(boxOf(rectOfWord(jL)), viewport);
          let target = a;
          const jN = L + 1 < words.length ? pageIndex(L + 1) : -1;
          if (jN >= 0 && jN !== jL && dom[jN]) {
            const b = perchOnWord(boxOf(rectOfWord(jN)), viewport);
            const span = Math.max(80, words[L + 1].s - words[L].s);
            const u = Math.min(1, Math.max(0, (t - words[L].s) / span));
            if (Math.abs(b.y - a.y) < 14) {
              // same line: slide from this word to the next, with a small bounce on the way
              const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
              target = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e - Math.sin(Math.PI * u) * 6 };
            } else if (u > 0.6) {
              target = b; // a new line: wait on the last word, then go
            }
          }
          const now = performance.now();
          const dt = Math.min(50, Math.max(8, now - lastFrame));
          lastFrame = now;
          if (!pos) pos = bot.where();
          const dist = Math.hypot(target.x - pos.x, target.y - pos.y);
          // quick on a long move (a new line), soft on a short one; quicker still when the voice is faster
          const tau = (dist > 140 ? 45 : 85) / Math.max(0.75, Math.min(2, audio.playbackRate || 1));
          const k = 1 - Math.exp(-dt / tau);
          pos = { x: pos.x + (target.x - pos.x) * k, y: pos.y + (target.y - pos.y) * k };
          bot.track(pos.x, pos.y);
        }
      }
    } catch {
      // a word that vanished mid-frame: the next frame looks again
      dom = [];
    }
  };
  raf = requestAnimationFrame(step);

  follower.stop = () => {
    off = true;
    cancelAnimationFrame(raf);
    clearReadingHighlights();
  };
  return follower;
}
