/** Ukuran tampilan menu di app — cukup tajam di retina, file tetap ringan */
export const MENU_IMAGE_MAX_EDGE = 960;
export const MENU_IMAGE_QUALITY = 0.82;
export const MENU_IMAGE_MAX_INPUT_MB = 12;

export type OptimizedMenuImage = {
  blob: Blob;
  contentType: string;
  ext: "webp" | "jpg";
  width: number;
  height: number;
  originalBytes: number;
  optimizedBytes: number;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal membaca gambar"));
    };
    img.src = url;
  });
}

function scaleDimensions(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

function supportsWebpExport(): boolean {
  try {
    const c = document.createElement("canvas");
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

/**
 * Kompres & resize di browser sebelum upload — kualitas visual bagus, payload kecil.
 */
export async function optimizeMenuImage(file: File): Promise<OptimizedMenuImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File harus berupa gambar (JPG, PNG, WebP)");
  }
  if (file.size > MENU_IMAGE_MAX_INPUT_MB * 1024 * 1024) {
    throw new Error(`Ukuran maksimal ${MENU_IMAGE_MAX_INPUT_MB} MB`);
  }

  const img = await loadImageFromFile(file);
  const { width, height } = scaleDimensions(img.naturalWidth, img.naturalHeight, MENU_IMAGE_MAX_EDGE);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung pengolahan gambar");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const useWebp = supportsWebpExport();
  const contentType = useWebp ? "image/webp" : "image/jpeg";
  const ext = useWebp ? "webp" : "jpg";
  let blob = await canvasToBlob(canvas, contentType, MENU_IMAGE_QUALITY);

  if (!blob) {
    blob = await canvasToBlob(canvas, "image/jpeg", MENU_IMAGE_QUALITY);
    if (!blob) throw new Error("Gagal mengompres gambar");
    return {
      blob,
      contentType: "image/jpeg",
      ext: "jpg",
      width,
      height,
      originalBytes: file.size,
      optimizedBytes: blob.size,
    };
  }

  return {
    blob,
    contentType,
    ext,
    width,
    height,
    originalBytes: file.size,
    optimizedBytes: blob.size,
  };
}

export function menuImageStoragePath(merchantId: string, productId: string, ext: string) {
  return `${merchantId}/${productId}.${ext}`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
