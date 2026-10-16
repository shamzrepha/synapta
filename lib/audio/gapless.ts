/**
 * Gapless, streaming playback for turn-by-turn audio (podcasts, audio lessons).
 *
 * - Every remaining line is fetched greedily in the background (a few at a time), nearest-first, so
 *   by the time one line is playing the next ones are already decoded.
 * - Playback uses the Web Audio clock: each decoded line is scheduled to start the instant the
 *   previous one ends (plus a small natural pause), so there are no audible gaps or restarts.
 * - A line that can't be voiced is read by the device voice at that point in the conversation.
 * - Seek, pause/resume and speed changes re-lay the schedule without losing your place.
 */

export type ClipState = "idle" | "loading" | "ready" | "failed";

export interface AudioBufferLike {
  duration: number;
}

export interface SourceLike {
  buffer: AudioBufferLike | null;
  playbackRate: { value: number; setValueAtTime?: (v: number, t: number) => void };
  connect(node: unknown): unknown;
  disconnect(): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface ContextLike {
  currentTime: number;
  destination: unknown;
  state?: string;
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close?(): Promise<void>;
}

export interface GaplessOptions {
  count: number;
  /** Encoded audio (mp3/wav) for a line, or null when this line has no saved recording. */
  fetchClip: (index: number) => Promise<ArrayBuffer | null>;
  /** Optional stand-in for a line with no recording. Left out, a line without a recording is skipped (never read by a robot voice). */
  speakFallback?: (index: number, rate: number, done: () => void) => void;
  cancelFallback?: () => void;
  onIndex: (index: number) => void;
  onBuffering: (buffering: boolean) => void;
  onEnd: () => void;
  onStatus?: () => void;
  createContext?: () => ContextLike;
  /** parallel background fetches (default 3) */
  concurrency?: number;
  /** pause between lines in seconds (default 0.14) */
  gapSec?: number;
  /** drive `tick()` yourself (tests) */
  autoTick?: boolean;
}

interface Clip {
  state: ClipState;
  raw?: ArrayBuffer;
  buf?: AudioBufferLike;
  decoding?: boolean;
}

interface Scheduled {
  index: number;
  src: SourceLike;
  buf: AudioBufferLike;
  start: number;
  /** playback position (media seconds) when `rateStart` was set, and the rate since then */
  offset: number;
  rateStart: number;
  rate: number;
}

const MAX_QUEUED = 3;

export class GaplessPlayer {
  private clips: Clip[];
  private ctx: ContextLike | null = null;
  private sched: Scheduled[] = [];
  private next = 0;
  private current = -1;
  private playing = false;
  private paused = false;
  private buffering = false;
  private fallbackIndex: number | null = null;
  private loadCursor = 0;
  private inflight = 0;
  private disposed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  rate = 1;

  constructor(private readonly o: GaplessOptions) {
    this.clips = Array.from({ length: o.count }, () => ({ state: "idle" as ClipState }));
    if (o.autoTick !== false) this.timer = setInterval(() => this.tick(), 80);
  }

  get size(): number {
    return this.o.count;
  }
  get isPlaying(): boolean {
    return this.playing && !this.paused;
  }
  get isPaused(): boolean {
    return this.playing && this.paused;
  }
  statusOf(i: number): ClipState {
    return this.clips[i]?.state ?? "idle";
  }
  get readyCount(): number {
    return this.clips.filter((c) => c.state === "ready" || c.state === "failed").length;
  }

  /** Start fetching from `from` onward in the background (call this as soon as the script exists). */
  preload(from = 0): void {
    this.loadCursor = Math.max(0, from);
    this.pumpLoads();
  }

  play(from = 0): void {
    if (this.disposed) return;
    const ctx = this.ensureContext();
    void ctx.resume();
    this.stopAudio();
    this.paused = false;
    this.playing = true;
    this.next = Math.max(0, Math.min(this.o.count - 1, from));
    this.setCurrent(this.next);
    this.loadCursor = this.next;
    this.pumpLoads();
    this.decodePending();
    this.pump();
  }

  pause(): void {
    if (!this.playing || this.paused) return;
    this.paused = true;
    void this.ctx?.suspend();
    if (this.fallbackIndex !== null) {
      // can't pause device speech mid-sentence reliably: re-read the line on resume
      this.o.cancelFallback?.();
      this.next = this.fallbackIndex;
      this.fallbackIndex = null;
    }
  }

  resume(): void {
    if (!this.playing || !this.paused) return;
    this.paused = false;
    void this.ctx?.resume();
    this.pump();
  }

  stop(): void {
    this.stopAudio();
    this.playing = false;
    this.paused = false;
    this.setBuffering(false);
  }

  jump(index: number): void {
    if (!this.playing) return this.play(index);
    this.stopAudio();
    this.paused = false;
    void this.ctx?.resume();
    this.next = Math.max(0, Math.min(this.o.count - 1, index));
    this.setCurrent(this.next);
    this.loadCursor = this.next;
    this.pumpLoads();
    this.pump();
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const c of this.sched) {
      if (c.start <= now) {
        // playing: continue from where it is at the new speed
        c.offset = c.offset + (now - c.rateStart) * c.rate;
        c.rateStart = now;
        c.rate = rate;
        if (c.src.playbackRate.setValueAtTime) c.src.playbackRate.setValueAtTime(rate, now);
        else c.src.playbackRate.value = rate;
      }
    }
    this.relayout();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.stopAudio();
    void this.ctx?.close?.();
    this.ctx = null;
  }

  /** Housekeeping: advance the "now playing" index, drop finished clips, schedule more, detect the end. */
  tick(): void {
    if (this.disposed || !this.ctx) return;
    if (this.paused) return;
    const now = this.ctx.currentTime;
    let latestStarted = -1;
    this.sched = this.sched.filter((c) => {
      const ended = this.endOf(c) <= now;
      if (c.start <= now && !ended) latestStarted = c.index;
      if (ended) {
        try {
          c.src.disconnect();
        } catch {
          // already gone
        }
      }
      return !ended;
    });
    if (latestStarted >= 0) this.setCurrent(latestStarted);
    this.pump();
    if (this.playing && this.next >= this.o.count && this.sched.length === 0 && this.fallbackIndex === null) {
      this.playing = false;
      this.setBuffering(false);
      this.o.onEnd();
    }
  }

  // ---------- loading ----------
  private pumpLoads(): void {
    const limit = this.o.concurrency ?? 3;
    while (this.inflight < limit) {
      let idx = -1;
      for (let i = this.loadCursor; i < this.o.count; i++) {
        if (this.clips[i].state === "idle") {
          idx = i;
          break;
        }
      }
      if (idx < 0) return;
      this.load(idx);
    }
  }

  private load(i: number): void {
    const clip = this.clips[i];
    clip.state = "loading";
    this.inflight++;
    this.o.onStatus?.();
    this.o
      .fetchClip(i)
      .catch(() => null)
      .then((raw) => {
        this.inflight--;
        if (this.disposed) return;
        if (!raw || raw.byteLength === 0) {
          clip.state = "failed";
        } else {
          clip.raw = raw;
          // a clip counts as ready once decoded (needs an AudioContext, which exists after the first Play tap)
          if (this.ctx) this.decode(i);
          else clip.state = "ready";
        }
        this.o.onStatus?.();
        this.pumpLoads();
        this.pump();
      });
  }

  private decodePending(): void {
    this.clips.forEach((c, i) => {
      if (c.raw && !c.buf) this.decode(i);
    });
  }

  private decode(i: number): void {
    const c = this.clips[i];
    if (!this.ctx || c.buf || c.decoding || !c.raw) return;
    c.decoding = true;
    this.ctx
      .decodeAudioData(c.raw.slice(0))
      .then((buf) => {
        c.buf = buf;
        c.state = "ready";
      })
      .catch(() => {
        c.state = "failed";
      })
      .finally(() => {
        c.decoding = false;
        this.o.onStatus?.();
        this.pump();
      });
  }

  // ---------- scheduling ----------
  private ensureContext(): ContextLike {
    if (!this.ctx) {
      this.ctx = this.o.createContext ? this.o.createContext() : this.defaultContext();
      this.decodePending();
    }
    return this.ctx;
  }

  private defaultContext(): ContextLike {
    const Ctor = (typeof window !== "undefined" && ((window as unknown as { AudioContext?: new () => ContextLike }).AudioContext || (window as unknown as { webkitAudioContext?: new () => ContextLike }).webkitAudioContext)) as (new () => ContextLike) | false;
    if (!Ctor) throw new Error("Web Audio is not supported");
    return new Ctor();
  }

  private endOf(c: Scheduled): number {
    return c.rateStart + (c.buf.duration - c.offset) / c.rate;
  }

  private pump(): void {
    if (!this.playing || this.paused || !this.ctx || this.disposed) return;
    const gap = this.o.gapSec ?? 0.14;
    while (this.next < this.o.count) {
      const clip = this.clips[this.next];
      if (this.fallbackIndex !== null) break;
      if (clip.state === "ready" && clip.buf) {
        if (this.sched.length >= MAX_QUEUED) break;
        const last = this.sched[this.sched.length - 1];
        const now = this.ctx.currentTime;
        const start = last ? Math.max(now + 0.02, this.endOf(last) + gap) : now + 0.05;
        this.schedule(this.next, clip.buf, start);
        this.next++;
      } else if (clip.state === "failed") {
        if (!this.o.speakFallback) {
          // no recording and no stand-in voice: skip the line once what's queued has played
          if (this.sched.length === 0) {
            this.next++;
            this.setCurrent(this.next);
            continue;
          }
          break;
        }
        // a stand-in voice can't overlap the clips: wait until what's queued has finished
        if (this.sched.length === 0) {
          const i = this.next;
          this.next++;
          this.fallbackIndex = i;
          this.setCurrent(i);
          this.o.speakFallback!(i, this.rate, () => {
            if (this.fallbackIndex !== i) return;
            this.fallbackIndex = null;
            this.pump();
          });
        }
        break;
      } else {
        break;
      }
    }
    const waiting = this.next < this.o.count && this.fallbackIndex === null && this.sched.length === 0;
    this.setBuffering(waiting);
  }

  private schedule(index: number, buf: AudioBufferLike, start: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = this.rate;
    src.connect(ctx.destination);
    src.start(start);
    this.sched.push({ index, src, buf, start, offset: 0, rateStart: start, rate: this.rate });
  }

  /** Re-times every not-yet-started clip after a speed change. */
  private relayout(): void {
    if (!this.ctx) return;
    const gap = this.o.gapSec ?? 0.14;
    const now = this.ctx.currentTime;
    const started = this.sched.filter((c) => c.start <= now);
    const queued = this.sched.filter((c) => c.start > now);
    for (const c of queued) {
      try {
        c.src.stop();
        c.src.disconnect();
      } catch {
        // not started yet
      }
    }
    this.sched = started;
    for (const q of queued) {
      const last = this.sched[this.sched.length - 1];
      const start = last ? Math.max(now + 0.02, this.endOf(last) + gap) : now + 0.05;
      this.schedule(q.index, q.buf, start);
    }
  }

  private stopAudio(): void {
    for (const c of this.sched) {
      try {
        c.src.stop();
        c.src.disconnect();
      } catch {
        // already stopped
      }
    }
    this.sched = [];
    if (this.fallbackIndex !== null) {
      this.o.cancelFallback?.();
      this.fallbackIndex = null;
    }
  }

  private setCurrent(i: number): void {
    if (i !== this.current) {
      this.current = i;
      this.o.onIndex(i);
    }
  }

  private setBuffering(b: boolean): void {
    if (b !== this.buffering) {
      this.buffering = b;
      this.o.onBuffering(b);
    }
  }
}

/** Picks distinct male/female device voices for the two hosts (best effort; falls back to pitch). */
export function pickDeviceVoices(voices: Array<{ name: string; lang: string }>): { female: number; male: number } | null {
  const en = voices.map((v, i) => ({ v, i })).filter(({ v }) => /^en/i.test(v.lang));
  if (en.length === 0) return null;
  const FEMALE = /female|woman|samantha|zira|susan|karen|victoria|moira|tessa|fiona|aria|jenny|hazel|libby|sonia|catherine|serena|allison|ava|kate|google uk english female/i;
  const MALE = /(^|[^a-z])male(?!.*female)|\bman\b|david|mark|daniel|alex|fred|george|guy|ryan|thomas|oliver|james|google uk english male|rishi/i;
  const f = en.find(({ v }) => FEMALE.test(v.name));
  const m = en.find(({ v }) => MALE.test(v.name) && v !== f?.v);
  if (f && m) return { female: f.i, male: m.i };
  if (f) {
    const other = en.find(({ i }) => i !== f.i);
    return other ? { female: f.i, male: other.i } : null;
  }
  if (m) {
    const other = en.find(({ i }) => i !== m.i);
    return other ? { female: other.i, male: m.i } : null;
  }
  return en.length > 1 ? { female: en[0].i, male: en[1].i } : null;
}
