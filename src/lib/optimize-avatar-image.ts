/** Foto profil driver — persegi, ringan, tajam di retina */
export const AVATAR_MAX_EDGE = 512;
export const AVATAR_QUALITY = 0.85;
export const AVATAR_MAX_INPUT_MB = 8;

export type OptimizedAvatarImage = {
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

/** Crop center square lalu resize ke AVATAR_MAX_EDGE. */
export async function optimizeAvatarImage(file: File): Promise<OptimizedAvatarImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File harus berupa gambar (JPG, PNG, WebP)");
  }
  if (file.size > AVATAR_MAX_INPUT_MB * 1024 * 1024) {
    throw new Error(`Ukuran maksimal ${AVATAR_MAX_INPUT_MB} MB`);
  }

  const img = await loadImageFromFile(file);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const side = Math.min(srcW, srcH);
  const sx = Math.floor((srcW - side) / 2);
  const sy = Math.floor((srcH - side) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_MAX_EDGE;
  canvas.height = AVATAR_MAX_EDGE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung pengolahan gambar");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_MAX_EDGE, AVATAR_MAX_EDGE);

  const useWebp = supportsWebpExport();
  const contentType = useWebp ? "image/webp" : "image/jpeg";
  const ext = useWebp ? "webp" : "jpg";
  let blob = await canvasToBlob(canvas, contentType, AVATAR_QUALITY);

  if (!blob) {
    blob = await canvasToBlob(canvas, "image/jpeg", AVATAR_QUALITY);
    if (!blob) throw new Error("Gagal mengompres gambar");
    return {
      blob,
      contentType: "image/jpeg",
      ext: "jpg",
      width: AVATAR_MAX_EDGE,
      height: AVATAR_MAX_EDGE,
      originalBytes: file.size,
      optimizedBytes: blob.size,
    };
  }

  return {
    blob,
    contentType,
    ext,
    width: AVATAR_MAX_EDGE,
    height: AVATAR_MAX_EDGE,
    originalBytes: file.size,
    optimizedBytes: blob.size,
  };
}
