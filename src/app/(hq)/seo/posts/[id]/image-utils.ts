// Browser-side image handling for the editor: compress before upload so posts stay light.

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the image."))), type, quality),
  );
}

/** Scales an inline image to at most `maxWidth` and re-encodes it as WebP. */
export async function compressToWebp(file: File, maxWidth = 1600) {
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Images must be under 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    const blob = await toBlob(canvas, "image/webp", 0.82);
    return { file: new File([blob], "image.webp", { type: "image/webp" }), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Crops a region (in the image's natural pixels) to an exact 1200x630 JPEG header. JPEG rather than
 * WebP because some link-preview crawlers still don't read WebP og:images.
 */
export async function cropHeader(img: HTMLImageElement, area: { x: number; y: number; width: number; height: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, 1200, 630);
  const blob = await toBlob(canvas, "image/jpeg", 0.86);
  return new File([blob], "header.jpg", { type: "image/jpeg" });
}
