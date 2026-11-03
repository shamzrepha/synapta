import { MAX_VISION_PAGES, VISION_BATCH, cleanVisionText, mergePages, pageNeedsVision, type ReadPage } from "@/lib/documents/pages";

export type ReadProgress = (message: string) => void;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
const isImage = (f: File) => IMAGE_TYPES.includes(f.type) || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(f.name);

/** Shrinks a canvas or image until its JPEG fits the server's size limit, then returns it as a data URL. */
function toJpegDataUrl(source: CanvasImageSource, width: number, height: number): string {
  let w = width;
  let h = height;
  const longest = 1800;
  if (Math.max(w, h) > longest) {
    const k = longest / Math.max(w, h);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  for (let q = 0.85, tries = 0; tries < 5; tries++, q -= 0.12, w = Math.round(w * 0.85), h = Math.round(h * 0.85)) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const url = c.toDataURL("image/jpeg", Math.max(0.4, q));
    if (url.length < 2_800_000) return url;
  }
  throw new Error("That page is too large to read. Try a smaller photo.");
}

async function readImages(images: string[]): Promise<string[]> {
  const res = await fetch("/api/documents/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images }),
  });
  const j = await res.json().catch(() => null);
  if (!j?.ok) throw new Error(j?.error?.message || "Couldn't read those pages. Please try again.");
  return (j.data.pages as string[]).map(cleanVisionText);
}

async function readImageFile(file: File, onProgress?: ReadProgress): Promise<string> {
  onProgress?.("Reading the photo…");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This photo format can't be opened here. Save it as JPEG or PNG and try again.");
  }
  const [text] = await readImages([toJpegDataUrl(bitmap, bitmap.width, bitmap.height)]);
  bitmap.close?.();
  if (!text) throw new Error("Couldn't find any readable text in that photo.");
  return text;
}

/**
 * Reads a PDF page by page. Typed pages use the PDF's own text; scanned pages and photos of notes are drawn to an image
 * and read by the AI (handwriting, formulas and figures included).
 */
export async function readPdf(file: File, onProgress?: ReadProgress): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist");
  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: ReadPage[] = [];
  const scans: number[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: unknown) => (it && typeof it === "object" && "str" in it ? (it as { str: string }).str : "")).join(" ");
    if (pageNeedsVision(text)) {
      scans.push(i);
      pages.push({ page: i, text: "", source: "unreadable" });
    } else {
      pages.push({ page: i, text, source: "text" });
    }
  }

  const todo = scans.slice(0, MAX_VISION_PAGES);
  for (let b = 0; b < todo.length; b += VISION_BATCH) {
    const batch = todo.slice(b, b + VISION_BATCH);
    onProgress?.(`Reading page ${batch[batch.length - 1]} of ${pdf.numPages} (scanned pages)…`);
    const images: string[] = [];
    for (const n of batch) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      images.push(toJpegDataUrl(canvas, canvas.width, canvas.height));
    }
    const texts = await readImages(images);
    batch.forEach((n, k) => {
      if (texts[k]) pages[n - 1] = { page: n, text: texts[k], source: "vision" };
    });
  }

  const merged = mergePages(pages);
  if (!merged.trim()) throw new Error("Couldn't read any text in this file. Try clearer pages.");
  if (scans.length > MAX_VISION_PAGES) {
    return `${merged}\n\n[Only the first ${MAX_VISION_PAGES} scanned pages were read. Split the file to read the rest.]`;
  }
  return merged;
}

export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    return await readPdf(file);
  } catch (err) {
    console.warn("PDF reading failed:", err);
    throw err instanceof Error ? err : new Error("Couldn't read this PDF.");
  }
}

export async function extractTextFromFile(file: File, onProgress?: ReadProgress): Promise<string> {
  if (isPdf(file)) return readPdf(file, onProgress);
  if (isImage(file)) return readImageFile(file, onProgress);
  return file.text();
}

/** True for photos and for PDFs whose first pages carry no text, which the server can't read but vision can. */
export async function needsVisionReading(file: File): Promise<boolean> {
  if (isImage(file)) return true;
  if (!isPdf(file)) return false;
  try {
    const pdfjsLib = await import("pdfjs-dist");
    if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const n = Math.min(pdf.numPages, 4);
    let scanned = 0;
    for (let i = 1; i <= n; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      const text = content.items.map((it: unknown) => (it && typeof it === "object" && "str" in it ? (it as { str: string }).str : "")).join(" ");
      if (pageNeedsVision(text)) scanned++;
    }
    return scanned * 2 > n;
  } catch {
    return false;
  }
}
