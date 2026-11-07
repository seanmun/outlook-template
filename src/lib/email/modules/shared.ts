/** Table-based building blocks every module renderer uses. Inline styles only. */
import { escapeAttr, escapeHtml, safeColor, sanitizeUrl, style } from "../html";
import { imageDisplayHeight, type Align, type ImageValue, type Padding } from "../fields";

export const TABLE_ATTRS = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

export function paddingCss(p: Padding): string {
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
}

/** One module row inside the 600px content table; spacing lives on the cell. */
export function moduleRow(opts: {
  rowAttrs: string;
  background: string;
  padding: Padding;
  align: Align;
  inner: string;
}): string {
  const bg = safeColor(opts.background, "#ffffff");
  return `<tr${opts.rowAttrs}><td align="${opts.align}" bgcolor="${bg}" style="${style({
    padding: paddingCss(opts.padding),
    "background-color": bg,
    "text-align": opts.align,
  })}">${opts.inner}</td></tr>`;
}

/** Wraps a block (image, button) so alignment works without CSS layout. */
export function alignedBlock(align: Align, inner: string): string {
  const margin = align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0";
  const alignAttr = align === "left" ? "" : ` align="${align}"`;
  return `<table ${TABLE_ATTRS}${alignAttr} style="${style({ margin, "border-collapse": "collapse" })}"><tr><td>${inner}</td></tr></table>`;
}

export function clampWidth(width: number, available: number): number {
  return Math.max(16, Math.min(Math.round(width), Math.max(16, available)));
}

/**
 * Renders an <img> with explicit dimensions, or a visible grey placeholder
 * block (table cell, not an image) when the asset is missing.
 */
export function imageHtml(opts: {
  image: ImageValue;
  src: string | null;
  available: number;
  fontFamily: string;
  placeholderLabel: string;
}): string {
  const width = clampWidth(opts.image.width, opts.available);
  const height = imageDisplayHeight(opts.image, width);
  if (!opts.src) {
    return `<table ${TABLE_ATTRS} width="${width}" style="${style({ width: `${width}px`, "border-collapse": "collapse" })}"><tr><td width="${width}" height="${Math.min(height, 400)}" bgcolor="#d9dde2" align="center" valign="middle" style="${style({
      width: `${width}px`,
      height: `${Math.min(height, 400)}px`,
      "background-color": "#d9dde2",
      "font-family": opts.fontFamily,
      "font-size": 13,
      color: "#5b6670",
      "text-align": "center",
    })}">${escapeHtml(opts.placeholderLabel)}</td></tr></table>`;
  }
  const img = `<img src="${escapeAttr(opts.src)}" width="${width}" height="${height}" alt="${escapeAttr(opts.image.alt)}" style="${style({
    display: "block",
    width: `${width}px`,
    height: `${height}px`,
    border: "0",
    outline: "none",
    "text-decoration": "none",
  })}">`;
  const href = sanitizeUrl(opts.image.linkUrl);
  return href ? `<a href="${escapeAttr(href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img;
}
