import { chunkForSpeech, cleanForSpeech } from "@/lib/voice/speech";

/**
 * Reads text aloud with the server's neural voice (a real audio file), piece by piece, fetching the next
 * piece while the current one plays. Replaces the browser's built-in robot voice everywhere.
 */
export interface Speaker {
  /** Speak `markdown` (formatting is stripped). `onDone` runs when it finishes, not when it is stopped. */
  say(markdown: string, onDone?: () => void, onFail?: () => void): void;
  stop(): void;
}

export function createSpeaker(voice: "female" | "male" = "female"): Speaker {
  let token = 0;
  let audio: HTMLAudioElement | null = null;
  const urls: string[] = [];

  const fetchPiece = async (text: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }) });
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

  const say = (markdown: string, onDone?: () => void, onFail?: () => void) => {
    stop();
    const pieces = chunkForSpeech(cleanForSpeech(markdown), 500).slice(0, 6);
    if (!pieces.length) return onDone?.();
    const mine = token;
    const queue = pieces.map((p) => fetchPiece(p)); // all pieces start fetching now; they play in order
    const playAt = async (i: number): Promise<void> => {
      if (mine !== token) return;
      if (i >= queue.length) {
        cleanup();
        return onDone?.();
      }
      const url = await queue[i];
      if (mine !== token) return;
      if (!url) {
        stop();
        return onFail?.();
      }
      const a = new Audio(url);
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

  return { say, stop };
}
