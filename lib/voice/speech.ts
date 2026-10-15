/** Minimal typings for the (prefixed, non-standard) Web Speech recognition API. */
export interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
export interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}
export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => RecognitionLike;

export function getRecognitionCtor(w: unknown): RecognitionCtor | null {
  const win = w as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | undefined;
  return win?.SpeechRecognition || win?.webkitSpeechRecognition || null;
}

/** Joins the transcript pieces of a recognition event into final + interim text. */
export function collectTranscript(results: ArrayLike<RecognitionResultLike>): { final: string; interim: string } {
  let final = "";
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const t = results[i][0]?.transcript ?? "";
    if (results[i].isFinal) final += t;
    else interim += t;
  }
  return { final: final.trim(), interim: interim.trim() };
}

/** Turns a Markdown/LaTeX answer into text that sounds right when spoken. */
export function cleanForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " code omitted. ")
    .replace(/\$\$?([^$]+)\$\$?/g, (_m, inner: string) => inner.replace(/\\[a-zA-Z]+/g, " ").replace(/[{}^_]/g, " "))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_`>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits text into sentence-sized chunks (browsers cut off long utterances). */
export function chunkForSpeech(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const s of sentences) {
    if (s.length > max) {
      flush();
      const words = s.split(/\s+/);
      for (const w of words) {
        if ((cur + " " + w).length > max) flush();
        cur += (cur ? " " : "") + w;
      }
      flush();
    } else if ((cur + s).length > max) {
      flush();
      cur = s;
    } else {
      cur += s;
    }
  }
  flush();
  return out;
}
