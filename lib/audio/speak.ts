import { chunkForSpeech, cleanForSpeech } from "@/lib/voice/speech";
import { readPrefs } from "@/components/settings/use-prefs";
import { readAccessibility } from "@/components/settings/use-accessibility";

export interface SpeakOptions {
  /** Playback rate (0.75..1.5); defaults to the learner's accessibility ttsSpeed. */
  rate?: number;
  /** Maximum number of chunks to read (default 20 so full notes/pages aren't cut short). */
  maxPieces?: number;
  /** Progress callback while reading multi-chunk passages. */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Reads text aloud with the server's neural voice (a real audio file), piece by piece, prefetching the next
 * piece while the current one plays. Replaces the browser's built-in robot voice everywhere.
 */
export interface Speaker {
  /** Speak `markdown` (formatting is stripped). `onDone` runs when it finishes, not when it is stopped. */
  say(markdown: string, onDone?: () => void, onFail?: () => void, opts?: SpeakOptions): void;
  setRate(rate: number): void;
  stop(): void;
}

export function createSpeaker(voice: "female" | "male" = "female"): Speaker {
  let token = 0;
  let audio: HTMLAudioElement | null = null;
  let currentRate: number = readAccessibility().ttsSpeed || 1;
  const urls: string[] = [];

  const fetchPiece = async (text: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, lang: readPrefs().language }),
      });
      if (!res.ok) return null;
      const url = URL.createObjectURL(await res.blob());
      urls.push(url);
      return url;
    } catch {
      return null;
    }
  };

  const cleanup = () => {
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  };

  const stop = () => {
    token++;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio = null;
    }
    cleanup();
  };

  const setRate = (rate: number) => {
    currentRate = Math.max(0.75, Math.min(1.5, rate));
    if (audio) {
      try {
        audio.playbackRate = currentRate;
      } catch {
        /* ignore */
      }
    }
  };

  const say = (markdown: string, onDone?: () => void, onFail?: () => void, opts?: SpeakOptions) => {
    stop();
    if (typeof opts?.rate === "number") currentRate = opts.rate;
    const maxPieces = Math.max(1, Math.min(30, opts?.maxPieces ?? 20));
    const pieces = chunkForSpeech(cleanForSpeech(markdown), 500).slice(0, maxPieces);
    if (!pieces.length) return onDone?.();
    const mine = token;
    // Sliding-window prefetch: start piece 0 now, and prefetch piece i+1 while piece i plays
    const pending = new Map<number, Promise<string | null>>();
    const ensure = (idx: number) => {
      if (idx >= pieces.length) return Promise.resolve(null);
      let p = pending.get(idx);
      if (!p) {
        p = fetchPiece(pieces[idx]);
        pending.set(idx, p);
      }
      return p;
    };

    const playAt = async (i: number): Promise<void> => {
      if (mine !== token) return;
      if (i >= pieces.length) {
        cleanup();
        return onDone?.();
      }
      if (i + 1 < pieces.length) void ensure(i + 1);
      const url = await ensure(i);
      if (mine !== token) return;
      if (!url) {
        stop();
        return onFail?.();
      }
      opts?.onProgress?.(i + 1, pieces.length);
      const a = new Audio(url);
      try {
        a.playbackRate = currentRate;
      } catch {
        /* ignore */
      }
      audio = a;
      a.onended = () => void playAt(i + 1);
      a.onerror = () => {
        if (mine !== token) return;
        stop();
        onFail?.();
      };
      a.play().catch(() => {
        if (mine !== token) return;
        stop();
        onFail?.();
      });
    };
    void playAt(0);
  };

  return { say, setRate, stop };
}
