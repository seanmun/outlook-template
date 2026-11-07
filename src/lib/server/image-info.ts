/** Reads type and pixel dimensions from image bytes without decoding. Never trusts the declared MIME type. */
import { sniffImageType } from "@/lib/export/pipeline";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 6000;

export interface ImageInfo {
  mimeType: "image/png" | "image/jpeg" | "image/gif";
  width: number;
  height: number;
}

function jpegSize(d: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < d.length) {
    if (d[i] !== 0xff) return null;
    const marker = d[i + 1];
    const len = (d[i + 2] << 8) | d[i + 3];
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (d[i + 5] << 8) | d[i + 6], width: (d[i + 7] << 8) | d[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

export function readImageInfo(d: Uint8Array): ImageInfo | null {
  const mimeType = sniffImageType(d);
  if (!mimeType) return null;
  let size: { width: number; height: number } | null = null;
  if (mimeType === "image/png" && d.length >= 24) {
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    size = { width: v.getUint32(16), height: v.getUint32(20) };
  } else if (mimeType === "image/gif" && d.length >= 10) {
    size = { width: d[6] | (d[7] << 8), height: d[8] | (d[9] << 8) };
  } else if (mimeType === "image/jpeg") {
    size = jpegSize(d);
  }
  if (!size || size.width < 1 || size.height < 1 || size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION) return null;
  return { mimeType, ...size };
}
