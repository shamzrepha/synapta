import { chunkForSpeech, cleanForSpeech } from "@/lib/voice/speech";
import { toBlocks } from "@/lib/study/locate";

export interface ReadChunk {
  /** what is spoken */
  text: string;
  /** the paragraph or heading on the page this chunk belongs to (used to highlight it and hop along its words while it is read) */
  block: string;
  /** optional anchor paragraph text used to locate which flipbook page holds this heading */
  pageAnchor?: string;
}

/** Turns a topic's title and note into the pieces that are read aloud, in order, each tied to its heading or paragraph. */
export function buildReadQueue(title: string, markdown: string, maxChars = 480): ReadChunk[] {
  const out: ReadChunk[] = [];
  const head = cleanForSpeech(title);
  const blocks = toBlocks(markdown);
  if (head) out.push({ text: `${head}.`, block: title, pageAnchor: blocks[0]?.text || title });
  let lastHeading = "";
  for (const b of blocks) {
    if (b.heading && b.heading !== lastHeading) {
      lastHeading = b.heading;
      const h = cleanForSpeech(b.heading);
      if (h) out.push({ text: `${h}.`, block: b.heading, pageAnchor: b.text || b.heading });
    }
    const spoken = cleanForSpeech(b.text);
    if (!spoken) continue;
    for (const piece of chunkForSpeech(spoken, maxChars)) out.push({ text: piece, block: b.text });
  }
  return out;
}
