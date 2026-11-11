/**
 * A design comp (image or PDF) the user attaches for the AI to inspect.
 * The type is decided from the file's bytes, never from a client-supplied name or MIME type.
 */
export type ReferenceMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf";

export interface Reference {
  mediaType: ReferenceMediaType;
  /** Base64, no data: prefix. */
  data: string;
}

/** Keeps the JSON request comfortably under common 4.5 MB serverless body limits. */
export const MAX_REFERENCE_BYTES = 3 * 1024 * 1024;

export function sniffReferenceType(d: Uint8Array): ReferenceMediaType | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => d[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && d[8] === 0x57 && d[9] === 0x45 && d[10] === 0x42 && d[11] === 0x50) return "image/webp";
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  return null;
}

/** Validates an uploaded comp and returns it in the form the model call needs. */
export function parseReference(base64: string): { ok: true; reference: Reference } | { ok: false; error: string } {
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  if (bytes.length === 0) return { ok: false, error: "The attached file is empty." };
  if (bytes.length > MAX_REFERENCE_BYTES) return { ok: false, error: `Attachments must be ${MAX_REFERENCE_BYTES / 1024 / 1024} MB or smaller.` };
  const mediaType = sniffReferenceType(bytes);
  if (!mediaType) return { ok: false, error: "Attach a PNG, JPEG, GIF, WebP image or a PDF." };
  return { ok: true, reference: { mediaType, data: Buffer.from(bytes).toString("base64") } };
}
