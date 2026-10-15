/**
 * Background audio pipeline for turn-by-turn playback (audio lessons, notebook podcasts).
 *
 * Clips are fetched one after another, starting from the line being played, so while one line
 * plays the following ones are already being voiced — playback behaves like a stream. A line the
 * player needs right now jumps the queue. Failed lines resolve to null so the player can use the
 * device voice for just that line.
 */
export type ClipStatus = "idle" | "loading" | "ready" | "failed";

export class ClipQueue {
  private urls = new Map<number, string | null>();
  private pending = new Map<number, Promise<string | null>>();
  private cursor = 0;
  private limit = Infinity;
  private pumping = false;
  private disposed = false;
  private listeners = new Set<() => void>();

  constructor(
    private readonly count: number,
    /** Returns a Blob (turned into an object URL), a ready URL, or null when the line can't be voiced */
    private readonly load: (index: number) => Promise<Blob | string | null>,
    private readonly makeUrl: (blob: Blob) => string = (b) => URL.createObjectURL(b),
    private readonly revokeUrl: (url: string) => void = (u) => URL.revokeObjectURL(u)
  ) {}

  get size(): number {
    return this.count;
  }

  status(i: number): ClipStatus {
    if (this.urls.has(i)) return this.urls.get(i) ? "ready" : "failed";
    return this.pending.has(i) ? "loading" : "idle";
  }

  /** Number of lines already voiced (ready or failed) */
  get settledCount(): number {
    return this.urls.size;
  }

  /** Subscribe to status changes (for progress UI). Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The clip for line `i`, loading it with priority if needed. */
  get(i: number): Promise<string | null> {
    if (i < 0 || i >= this.count || this.disposed) return Promise.resolve(null);
    if (this.urls.has(i)) return Promise.resolve(this.urls.get(i) ?? null);
    const inflight = this.pending.get(i);
    if (inflight) return inflight;
    const p = this.load(i)
      .catch(() => null)
      .then((res) => {
        let url: string | null = null;
        if (res instanceof Blob) url = res.size > 0 ? this.makeUrl(res) : null;
        else if (typeof res === "string" && res) url = res;
        if (this.disposed) {
          if (url && res instanceof Blob) this.revokeUrl(url);
          return null;
        }
        this.urls.set(i, url);
        this.pending.delete(i);
        this.emit();
        return url;
      });
    this.pending.set(i, p);
    this.emit();
    return p;
  }

  /**
   * Keep voicing lines from `index` onward, one at a time, in the background.
   * `ahead` caps how far past `index` to go (e.g. 1 to only warm the first line before Play).
   */
  startFrom(index: number, ahead = Infinity): void {
    this.cursor = Math.max(0, index);
    this.limit = ahead;
    void this.pump();
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    for (const url of this.urls.values()) if (url && url.startsWith("blob:")) this.revokeUrl(url);
    this.urls.clear();
    this.pending.clear();
  }

  private nextToLoad(): number | null {
    const end = Math.min(this.count, this.cursor + this.limit);
    for (let i = this.cursor; i < end; i++) if (!this.urls.has(i)) return i;
    return null;
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (!this.disposed) {
        const i = this.nextToLoad();
        if (i === null) break;
        await this.get(i);
      }
    } finally {
      this.pumping = false;
    }
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
