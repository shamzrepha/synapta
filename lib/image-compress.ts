"use client";

/** Resizes an image to fit `maxSide` and re-encodes it (JPEG; PNG kept for small graphics/GIFs as-is). */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<string> {
  if (file.type === "image/gif" && file.size < 650_000) return readAsDataUrl(file);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Compresses and uploads; returns the storage path to attach to a post. */
export async function uploadPostImage(file: File): Promise<{ path: string; url: string }> {
  // Stay under the server's 700 KB limit (≈ 930k base64 chars): step down size/quality until it fits
  let dataUrl = await compressImage(file);
  for (const [side, q] of [[1400, 0.75], [1200, 0.68], [1000, 0.6]] as const) {
    if (dataUrl.length <= 900_000) break;
    dataUrl = await compressImage(file, side, q);
  }
  const res = await fetch("/api/uploads/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl, scope: "posts" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message || "Upload failed");
  return data.data;
}
