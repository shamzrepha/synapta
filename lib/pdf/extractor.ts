export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const pdfjsLib = await import("pdfjs-dist");
    if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || "4.10.38"}/build/pdf.worker.min.mjs`;
    }
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: unknown) =>
          item && typeof item === "object" && "str" in item ? (item as { str: string }).str : ""
        )
        .join(" ");
      fullText += `[Page ${i}]\n${pageText}\n\n`;
    }
    return fullText.trim();
  } catch (err) {
    console.warn("PDF extraction fallback decoding:", err);
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    const rawStr = textDecoder.decode(new Uint8Array(arrayBuffer));
    const matches = rawStr.match(/\(([^()]+)\)/g);
    if (matches && matches.length > 10) {
      return matches.map((m) => m.slice(1, -1)).join(" ");
    }
    return `[PDF Document: ${file.name}]\nDocument uploaded (${Math.round(file.size / 1024)} KB).`;
  }
}

export async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractTextFromPdf(file);
  }
  return file.text();
}
