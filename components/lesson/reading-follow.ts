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
  let lastLineTop = -1;
  let lastScroll = 0;
  let off = false;
  let lost = false;
  /** the page word Sprout is standing on, and when its current hop ends (until then the hop itself moves it) */
  let perch = -1;
  let hopEnds = 0;

  const boxOf = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });

  /** Hop to the word. A new hop takes over from where Sprout really is, so it never queues up behind the voice or gets stuck on a hop that was left behind. */
  const hopTo = (to: { x: number; y: number }, ms: number) => {
    if (off) return;
    const from = bot.where();
    const path = hopPath(from, to);
    hopEnds = performance.now() + ms;
    // never wait on a hop that cannot finish (a hidden tab pauses animations): give it its time plus a little, then let the next one run
    void Promise.race([bot.path(path, { duration: ms, pose: "idle" }), new Promise<void>((r) => window.setTimeout(r, ms + 400))]).catch(() => {});
  };

  const rangeOf = (j: number): Range => {
    const r = document.createRange();
    r.setStart(dom[j].node, dom[j].start);
    r.setEnd(dom[j].node, dom[j].end);
    return r;
  };
  const rectOfWord = (j: number): DOMRect => rangeOf(j).getBoundingClientRect();

  const lineOf = (j: number): Range => {
    const top = rectOfWord(j).top;
    const topOf = (k: number) => rectOfWord(k).top;
    let a = j;
    let b = j;
    while (a > 0 && Math.abs(topOf(a - 1) - top) < 4) a--;
    while (b < dom.length - 1 && Math.abs(topOf(b + 1) - top) < 4) b++;
    const range = document.createRange();
    range.setStart(dom[a].node, dom[a].start);
    range.setEnd(dom[b].node, dom[b].end);
    lastLineTop = top;
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
    perch = -1;
    return dom.length > 0;
  };

  let lastLead = -2;
  const step = () => {
    if (off) return;
    raf = requestAnimationFrame(step);
    try {
      if (dom.length === 0 || !dom[0].node.isConnected) {
        if (!recover()) return;
        lastLead = -2;
      }
      const ms = audio.currentTime * 1000;

      // the word being said glows
      const idx = wordAt(words, ms);
      if (idx !== last && idx >= 0) {
        last = idx;
        const j = pageIndex(idx);
        if (j >= 0 && dom[j]) {
          const range = rangeOf(j);
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
      // before the voice has started (Sprout gets there first) it stands on the very first word, not on one a little way in
      const lead = ms < 40 ? 0 : wordAt(words, ms + 190);
      if (lead !== lastLead && lead >= 0) {
        lastLead = lead;
        const j = pageIndex(lead);
        if (j >= 0 && dom[j]) {
          perch = j;
          const to = perchOnWord(boxOf(rectOfWord(j)), { width: window.innerWidth, height: window.innerHeight });
          const from = bot.where();
          if (Math.hypot(to.x - from.x, to.y - from.y) > 1.5) {
            // the voice may be sped up, so a word takes less real time than its length in the clip
            hopTo(to, Math.max(90, hopMs(from, to, Math.max(120, words[lead].e - words[lead].s)) / Math.max(0.5, audio.playbackRate)));
          }
        }
      } else if (perch >= 0 && dom[perch] && performance.now() > hopEnds) {
        // between hops Sprout stays on its word while the page scrolls under it
        const to = perchOnWord(boxOf(rectOfWord(perch)), { width: window.innerWidth, height: window.innerHeight });
        bot.stick(to.x, to.y);
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
