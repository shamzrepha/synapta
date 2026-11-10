import { chunkForSpeech, cleanForSpeech } from "@/lib/voice/speech";
import { toBlocks } from "@/lib/study/locate";

export interface ReadChunk {
  /** what is spoken */
  text: string;
  /** the paragraph on the page this chunk belongs to (used to highlight it while it is read) */
  block: string;
}

/** Turns a topic's title and note into the pieces that are read aloud, in order, each tied to its paragraph. */
export function buildReadQueue(title: string, markdown: string, maxChars = 480): ReadChunk[] {
  const out: ReadChunk[] = [];
  const head = cleanForSpeech(title);
  if (head) out.push({ text: `${head}.`, block: "" });
  let lastHeading = "";
  for (const b of toBlocks(markdown)) {
    if (b.heading && b.heading !== lastHeading) {
      lastHeading = b.heading;
      const h = cleanForSpeech(b.heading);
      if (h) out.push({ text: `${h}.`, block: "" });
    }
    const spoken = cleanForSpeech(b.text);
    if (!spoken) continue;
    for (const piece of chunkForSpeech(spoken, maxChars)) out.push({ text: piece, block: b.text });
  }
  return out;
}
