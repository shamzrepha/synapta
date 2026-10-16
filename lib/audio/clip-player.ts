/**
 * Plays a podcast or lesson one saved clip after another with ordinary HTML5 <audio> elements: native
 * buffering, native play/pause and playback speed, and no audio-engine stitching. The next lines are
 * fetched in the background and held ready, so each line starts the moment the previous one ends. A line
 * with no saved recording is skipped; nothing here ever uses the device's built-in robot voice.
 */
export type ClipState = "idle" | "loading" | "ready" | "failed";

export interface AudioLike {
  src: string;
  playbackRate: number;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void> | void;
  pause(): void;
}

export interface ClipPlayerOptions {
  count: number;
  /** Encoded audio (mp3/wav) for a line, or null when this line has no saved recording. */
  fetchClip: (index: number) => Promise<ArrayBuffer | null>;
  onIndex: (index: number) => void;
  onBuffering: (buffering: boolean) => void;
  onEnd: () => void;
  onStatus?: () => void;
  /** parallel background fetches (default 3) */
  concurrency?: number;
  createAudio?: () => AudioLike;
  createUrl?: (data: ArrayBuffer) => string;
  revokeUrl?: (url: string) => void;
}

interface Clip {
  state: ClipState;
  url?: string;
  audio?: AudioLike;
}

const isWav = (b: ArrayBuffer) => {
  const h = new Uint8Array(b.slice(0, 4));
  return h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46; // "RIFF"
};

export class ClipPlayer {
  private clips: Clip[];
  private current = -1;
  private playing = false;
  private paused = false;
  private buffering = false;
  private loadCursor = 0;
  private inflight = 0;
  private disposed = false;
  rate = 1;

  constructor(private readonly o: ClipPlayerOptions) {
    this.clips = Array.from({ length: o.count }, () => ({ state: "idle" as ClipState }));
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
    this.haltCurrent();
    this.paused = false;
    this.playing = true;
    this.current = Math.max(0, Math.min(this.o.count - 1, from));
    this.o.onIndex(this.current);
    this.loadCursor = this.current;
    this.pumpLoads();
    this.startCurrent();
  }

  pause(): void {
    if (!this.playing || this.paused) return;
    this.paused = true;
    this.clips[this.current]?.audio?.pause();
  }

  resume(): void {
    if (!this.playing || !this.paused) return;
    this.paused = false;
    this.startCurrent();
  }

  stop(): void {
    this.haltCurrent();
    this.playing = false;
    this.paused = false;
    this.setBuffering(false);
  }

  jump(index: number): void {
    if (!this.playing) return this.play(index);
    this.play(index);
  }

  setRate(rate: number): void {
    this.rate = rate;
    for (const c of this.clips) if (c.audio) c.audio.playbackRate = rate;
  }

  dispose(): void {
    this.disposed = true;
    this.haltCurrent();
    for (const c of this.clips) {
      if (c.url) (this.o.revokeUrl ?? ((u) => URL.revokeObjectURL(u)))(c.url);
      c.url = undefined;
      c.audio = undefined;
    }
  }

  // ---------- playing ----------
  private audioFor(i: number): AudioLike | null {
    const c = this.clips[i];
    if (!c || !c.url) return null;
    if (!c.audio) {
      const a = this.o.createAudio ? this.o.createAudio() : (new Audio() as unknown as AudioLike);
      (a as unknown as { preload?: string }).preload = "auto";
      a.src = c.url;
      a.playbackRate = this.rate;
      c.audio = a;
    }
    return c.audio;
  }

  private haltCurrent(): void {
    const a = this.clips[this.current]?.audio;
    if (a) {
      a.onended = null;
      a.onerror = null;
      a.pause();
      try {
        (a as unknown as { currentTime: number }).currentTime = 0;
      } catch {
        /* not seekable yet */
      }
    }
  }

  /** Starts the current line when it is ready, skips it when it has no recording, waits (buffering) otherwise. */
  private startCurrent(): void {
    if (!this.playing || this.paused || this.disposed) return;
    const i = this.current;
    if (i >= this.o.count) return this.finish();
    const c = this.clips[i];
    if (c.state === "failed") return this.advance();
    if (c.state !== "ready") {
      this.setBuffering(true);
      return;
    }
    const a = this.audioFor(i)!;
    this.setBuffering(false);
    a.playbackRate = this.rate;
    a.onended = () => this.advance();
    a.onerror = () => {
      c.state = "failed";
      this.o.onStatus?.();
      this.advance();
    };
    Promise.resolve(a.play()).catch(() => {
      // autoplay refused or the file wouldn't decode: treat the line as unavailable and carry on
      c.state = "failed";
      this.o.onStatus?.();
      this.advance();
    });
    // keep the next lines warm so there is no wait between them
    this.loadCursor = Math.max(this.loadCursor, i);
    this.pumpLoads();
    this.audioFor(i + 1);
  }

  private advance(): void {
    if (!this.playing || this.disposed) return;
    this.current++;
    if (this.current >= this.o.count) return this.finish();
    this.o.onIndex(this.current);
    this.startCurrent();
  }

  private finish(): void {
    this.playing = false;
    this.paused = false;
    this.setBuffering(false);
    this.current = 0;
    this.o.onEnd();
  }

  private setBuffering(b: boolean): void {
    if (this.buffering === b) return;
    this.buffering = b;
    this.o.onBuffering(b);
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
          clip.url = this.o.createUrl ? this.o.createUrl(raw) : URL.createObjectURL(new Blob([raw], { type: isWav(raw) ? "audio/wav" : "audio/mpeg" }));
          clip.state = "ready";
        }
        this.o.onStatus?.();
        this.pumpLoads();
        if (this.playing && !this.paused && i === this.current) this.startCurrent();
      });
  }
}
