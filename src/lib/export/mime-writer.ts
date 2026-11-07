/**
 * RFC 5322 / MIME writer for an unsent HTML message with inline images.
 *
 * Structure:
 *   multipart/alternative
 *     text/plain
 *     multipart/related (type="text/html")
 *       text/html
 *       image/* (Content-ID, inline)  ...
 *
 * Used by the experimental EMLTPL exporter. Outlook for Mac's .emltpl has
 * no published specification; community evidence indicates it is a MIME
 * message carrying an `X-Unsent: 1` header. See docs/EXPORT.md.
 */

export interface MimeInlineImage {
  contentId: string;
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

export interface MimeInput {
  subject: string;
  html: string;
  plainText: string;
  images: MimeInlineImage[];
  extraHeaders?: Record<string, string>;
  /** Injected for deterministic tests. */
  boundarySeed?: string;
  now?: Date;
}

const CRLF = "\r\n";

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function wrap76(s: string): string {
  return s.replace(/.{1,76}/g, (m) => m + CRLF).replace(/\r\n$/, "");
}

/** RFC 2047 encoded-word for non-ASCII header text, split to keep lines short. */
export function encodeHeaderValue(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ");
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  const words: string[] = [];
  let chunk = "";
  const enc = new TextEncoder();
  for (const ch of clean) {
    if (enc.encode(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${base64(enc.encode(w))}?=`).join(CRLF + " ");
}

function assertHeaderSafe(name: string, value: string) {
  if (!/^[A-Za-z0-9-]+$/.test(name)) throw new Error(`Invalid header name: ${name}`);
  if (/[\r\n]/.test(value)) throw new Error(`Header ${name} must not contain line breaks`);
}

function quoteParam(v: string): string {
  return `"${v.replace(/["\\\r\n]/g, "_")}"`;
}

export function writeMime(input: MimeInput): string {
  const seed = input.boundarySeed ?? Math.random().toString(36).slice(2, 12);
  const altBoundary = `----=_Alt_${seed}`;
  const relBoundary = `----=_Rel_${seed}`;
  const enc = new TextEncoder();

  const headers: string[] = [];
  for (const [k, v] of Object.entries(input.extraHeaders ?? {})) {
    assertHeaderSafe(k, v);
    headers.push(`${k}: ${v}`);
  }
  headers.push(`Subject: ${encodeHeaderValue(input.subject)}`);
  headers.push(`Date: ${(input.now ?? new Date()).toUTCString().replace("GMT", "+0000")}`);
  headers.push("MIME-Version: 1.0");
  headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);

  const parts: string[] = [];
  parts.push(headers.join(CRLF), "", "This is a multi-part message in MIME format.", "");

  parts.push(`--${altBoundary}`);
  parts.push("Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "");
  parts.push(wrap76(base64(enc.encode(input.plainText))), "");

  parts.push(`--${altBoundary}`);
  parts.push(`Content-Type: multipart/related; type="text/html"; boundary="${relBoundary}"`, "");

  parts.push(`--${relBoundary}`);
  parts.push("Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "");
  parts.push(wrap76(base64(enc.encode(input.html))), "");

  for (const img of input.images) {
    if (!/^[A-Za-z0-9._@-]+$/.test(img.contentId)) throw new Error(`Unsafe Content-ID: ${img.contentId}`);
    if (!/^image\/(png|jpeg|gif)$/.test(img.mimeType)) throw new Error(`Unsupported image type: ${img.mimeType}`);
    parts.push(`--${relBoundary}`);
    parts.push(
      `Content-Type: ${img.mimeType}; name=${quoteParam(img.filename)}`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${img.contentId}>`,
      `Content-Disposition: inline; filename=${quoteParam(img.filename)}`,
      "",
    );
    parts.push(wrap76(base64(img.data)), "");
  }
  parts.push(`--${relBoundary}--`, "");
  parts.push(`--${altBoundary}--`, "");
  return parts.join(CRLF);
}
