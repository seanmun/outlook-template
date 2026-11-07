/** HTML/URL safety helpers shared by every renderer. */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const escapeAttr = escapeHtml;

const ALLOWED_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

/**
 * Returns a normalised URL if it is an absolute http(s)/mailto link, otherwise null.
 * Rejects javascript:, data:, vbscript:, relative paths, and control characters.
 */
export function sanitizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.length > 2048) return null;
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
  if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.hostname) return null;
  if (parsed.username || parsed.password) return null;
  return parsed.href;
}

export function isSafeUrl(raw: string): boolean {
  return sanitizeUrl(raw) !== null;
}

/** Inline style builder: drops empty values, never emits raw user input without validation upstream. */
export function style(props: Record<string, string | number | null | undefined | false>): string {
  return Object.entries(props)
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== "")
    .map(([k, v]) => `${k}:${typeof v === "number" ? `${v}px` : v}`)
    .join(";");
}

/** Only #rrggbb is accepted anywhere colours reach HTML. */
export function safeColor(value: string, fallback = "#000000"): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}
