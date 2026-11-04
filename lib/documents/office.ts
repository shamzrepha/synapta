/**
 * Reads the text out of Word (.docx) and PowerPoint (.pptx) files in the browser, with no extra library: both are ZIP
 * files of XML, and browsers can inflate the entries themselves.
 */

const dec = new TextDecoder("utf-8");

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Lists the files in a ZIP (from its central directory) and returns each one's bytes, inflated. */
export async function readZip(buf: ArrayBuffer | Uint8Array, wanted?: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // end-of-central-directory record: the last 22+ bytes, signature 0x06054b50
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This file isn't a valid Word or PowerPoint document.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true);
    const elen = v.getUint16(p + 30, true);
    const clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (wanted && !wanted(name)) continue;
    const lnlen = v.getUint16(local + 26, true);
    const lelen = v.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lelen;
    const raw = b.subarray(start, start + csize);
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8) out.set(name, await inflateRaw(raw));
  }
  return out;
}

const unxml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** Paragraph text of a Word document body. Heading styles become markdown headings, so the outline survives. */
export function docxXmlToText(xml: string): string {
  const out: string[] = [];
  for (const para of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    const style = /<w:pStyle w:val="([^"]+)"/.exec(para)?.[1] || "";
    const level = /^(?:Heading|Title)\s*(\d)?$/i.exec(style.replace(/([a-z])(\d)/i, "$1 $2"));
    const text = unxml(
      para
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br\/>/g, "\n")
        .replace(/<(?!\/?w:t[ >])[^>]*>/g, "")
        .replace(/<\/?w:t[^>]*>/g, "")
    ).trim();
    if (!text) continue;
    out.push(level ? `${"#".repeat(Math.min(6, Number(level[1] || 1)))} ${text}` : text);
  }
  return out.join("\n");
}

/** Text of one slide: each paragraph on its own line. */
export function pptxSlideToText(xml: string): string {
  const out: string[] = [];
  for (const para of xml.match(/<a:p>[\s\S]*?<\/a:p>|<a:p [\s\S]*?<\/a:p>/g) || []) {
    const text = unxml((para.match(/<a:t>[\s\S]*?<\/a:t>|<a:t [^>]*>[\s\S]*?<\/a:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("")).trim();
    if (text) out.push(text);
  }
  return out.join("\n");
}

export async function readDocx(buf: ArrayBuffer): Promise<string> {
  const files = await readZip(buf, (n) => n === "word/document.xml");
  const xml = files.get("word/document.xml");
  if (!xml) throw new Error("Couldn't find any text in this Word file.");
  return docxXmlToText(dec.decode(xml));
}

export async function readPptx(buf: ArrayBuffer): Promise<string> {
  const files = await readZip(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const slides = [...files.entries()].sort((a, b) => Number(/(\d+)\.xml$/.exec(a[0])![1]) - Number(/(\d+)\.xml$/.exec(b[0])![1]));
  if (!slides.length) throw new Error("Couldn't find any slides in this PowerPoint file.");
  return slides
    .map(([name, bytes], i) => {
      const t = pptxSlideToText(dec.decode(bytes));
      return t ? `[Slide ${i + 1}]\n${t}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
