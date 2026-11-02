/**
 * Translates the app's interface in the browser: every visible label, button, heading, placeholder and tooltip is
 * swapped for the learner's language. Translations come from the server's shared translation memory (one model
 * call per phrase per language, ever) and are kept on the device so the next page load is instant.
 *
 * Text is changed in place (a text node's value, an attribute), never by moving or wrapping nodes, so React keeps
 * working: when React later writes new text into a node, the observer sees it and translates the new text.
 * Lessons and other class content are translated on the server, and code, maths, circuits and anything marked
 * translate="no" are left alone.
 */

const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;
const SKIP = [
  "script", "style", "noscript", "code", "pre", "textarea", "svg", "canvas", "iframe", "math",
  ".katex", "[translate='no']", "[data-no-translate]", "[contenteditable='true']",
  ".blocklyWidgetDiv", ".blocklySvg", ".blocklyToolboxDiv", ".cm-editor", ".monaco-editor",
].join(",");
const MAX_LEN = 1500;
const BATCH = 60;
const STORE_LIMIT = 4000;

/** Interface text worth translating (has letters; not a number, address, handle or code-like token). */
export function isUiText(text: string): boolean {
  const s = text.trim();
  if (s.length < 2 || s.length > MAX_LEN || !/\p{L}/u.test(s)) return false;
  if (/^(https?:\/\/|www\.|\/|#|@)[^\s]*$/i.test(s)) return false;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(s)) return false;
  if (/^[\d\s.,:%+\-–×x/()]+[a-zA-Z]{0,3}$/.test(s)) return false; // "12 XP", "3/10", "4.5 V"
  if (!/\s/.test(s) && /[_{}<>=;]|^[a-z]+[A-Z]/.test(s)) return false; // identifiers and code
  return true;
}

/** Keeps the original's surrounding spaces around the translation. */
export function withSpacing(original: string, translated: string): string {
  const lead = original.match(/^\s*/)?.[0] ?? "";
  const trail = original.match(/\s*$/)?.[0] ?? "";
  return lead + translated.trim() + trail;
}

type Target = { kind: "text"; node: Text } | { kind: "attr"; el: Element; attr: string };

export class DomTranslator {
  private cache = new Map<string, string>();
  private textState = new WeakMap<Text, { src: string; applied: string }>();
  private attrState = new WeakMap<Element, Map<string, { src: string; applied: string }>>();
  private waiting = new Map<string, Target[]>();
  private inflight = new Set<string>();
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = new Set<Node>();
  private stopped = false;

  constructor(private lang: string, private fetchTranslations: (lang: string, texts: string[]) => Promise<Record<string, string>>) {
    try {
      const raw = localStorage.getItem(this.storeKey());
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) this.cache.set(k, v);
    } catch {
      /* storage blocked: start empty */
    }
  }

  private storeKey() {
    return `sunroot.i18n.${this.lang}`;
  }

  start(root: Node = document.body) {
    this.scan(root);
    this.observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") this.dirty.add(r.target);
        else if (r.type === "attributes") this.dirty.add(r.target);
        else r.addedNodes.forEach((n) => this.dirty.add(n));
      }
      this.schedule();
    });
    this.observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  }

  stop() {
    this.stopped = true;
    this.observer?.disconnect();
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const nodes = Array.from(this.dirty);
      this.dirty.clear();
      for (const n of nodes) if (n.isConnected) this.scan(n);
      this.flush();
    }, 120);
  }

  private skipped(el: Element | null): boolean {
    return !el || !!el.closest(SKIP);
  }

  scan(root: Node) {
    if (root.nodeType === Node.TEXT_NODE) {
      this.visitText(root as Text);
    } else if (root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_NODE) {
      const el = root as Element;
      if (root.nodeType === Node.ELEMENT_NODE && this.skipped(el)) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) this.visitText(n as Text);
      if (root.nodeType === Node.ELEMENT_NODE) this.visitAttrs(el);
      (el.querySelectorAll?.(ATTRS.map((a) => `[${a}]`).join(",")) ?? []).forEach((e) => this.visitAttrs(e));
    }
    this.flush();
  }

  private visitText(node: Text) {
    const value = node.nodeValue ?? "";
    const state = this.textState.get(node);
    if (state && value === state.applied) return; // our own translation
    if (!isUiText(value) || this.skipped(node.parentElement)) return;
    const src = value.trim();
    this.textState.set(node, { src: value, applied: value });
    this.place(src, { kind: "text", node });
  }

  private visitAttrs(el: Element) {
    if (this.skipped(el)) return;
    for (const attr of ATTRS) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const states = this.attrState.get(el) ?? new Map();
      const st = states.get(attr);
      if (st && value === st.applied) continue;
      if (!isUiText(value)) continue;
      states.set(attr, { src: value, applied: value });
      this.attrState.set(el, states);
      this.place(value.trim(), { kind: "attr", el, attr });
    }
  }

  private place(src: string, target: Target) {
    const t = this.cache.get(src);
    if (t !== undefined) return this.apply(target, t);
    const list = this.waiting.get(src) ?? [];
    list.push(target);
    this.waiting.set(src, list);
  }

  private apply(target: Target, translated: string) {
    if (target.kind === "text") {
      const st = this.textState.get(target.node);
      if (!st || !target.node.isConnected || target.node.nodeValue !== st.applied) return;
      const next = withSpacing(st.src, translated);
      st.applied = next;
      if (target.node.nodeValue !== next) target.node.nodeValue = next;
    } else {
      const st = this.attrState.get(target.el)?.get(target.attr);
      if (!st || target.el.getAttribute(target.attr) !== st.applied) return;
      st.applied = translated;
      target.el.setAttribute(target.attr, translated);
    }
  }

  private flush() {
    if (this.stopped) return;
    const todo = Array.from(this.waiting.keys()).filter((k) => !this.inflight.has(k));
    for (let i = 0; i < todo.length; i += BATCH) {
      const group = todo.slice(i, i + BATCH);
      group.forEach((g) => this.inflight.add(g));
      this.fetchTranslations(this.lang, group)
        .then((map) => {
          for (const src of group) {
            const t = map[src];
            const targets = this.waiting.get(src) ?? [];
            this.waiting.delete(src);
            if (typeof t === "string" && t.trim()) {
              this.cache.set(src, t);
              targets.forEach((tg) => this.apply(tg, t));
            }
          }
          this.persist();
        })
        .catch(() => group.forEach((src) => this.waiting.delete(src)))
        .finally(() => group.forEach((g) => this.inflight.delete(g)));
    }
  }

  private persist() {
    try {
      const entries = Array.from(this.cache.entries()).slice(-STORE_LIMIT);
      localStorage.setItem(this.storeKey(), JSON.stringify(Object.fromEntries(entries)));
    } catch {
      /* full or blocked: the server memory still makes the next load fast */
    }
  }
}
