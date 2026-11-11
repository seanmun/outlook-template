/**
 * The one renderer used by both the live preview and every exporter.
 *
 * Compatibility constraints (see docs/EMAIL-HTML.md): the <head> is treated as
 * disposable, so nothing essential lives there. Table layout, inline styles,
 * explicit image dimensions, no classes/media queries/scripts/web fonts/flex/grid.
 */
import { requireBrand } from "./brands";
import type { EmailDocument } from "./document";
import { escapeAttr, escapeHtml, safeColor } from "./html";
import type { ImageSource } from "./fields";
import { getModule, rendererFor } from "./registry";
import { richTextToPlain, type RichText } from "./richtext";
import { TABLE_ATTRS } from "./modules/shared";

export const CONTENT_WIDTH = 600;

export interface RenderOptions {
  resolveImage: (src: ImageSource) => string | null;
  /** Adds data-module-id attributes so the preview can map clicks to modules. Never set for export. */
  annotate?: boolean;
  selectedModuleId?: string | null;
}

/** Expects a document that already passed validateDocument(). */
export function renderEmailHtml(doc: EmailDocument, opts: RenderOptions): string {
  const brand = requireBrand(doc.brandId);
  const pageBg = safeColor(brand.colors.pageBackground);
  const contentBg = safeColor(brand.colors.contentBackground);

  const rows = doc.modules
    .map((m) => {
      const def = getModule(m.type);
      if (!def) return "";
      const rowAttrs = opts.annotate ? ` data-module-id="${escapeAttr(m.id)}"` : "";
      return rendererFor(def, brand)({
        brand,
        content: m.content,
        settings: m.settings,
        rowAttrs,
        resolveImage: opts.resolveImage,
        contentWidth: CONTENT_WIDTH,
      });
    })
    .join("\n");

  const previewStyle =
    opts.annotate
      ? `<style>[data-module-id]{cursor:pointer}[data-module-id]:hover{outline:2px dashed #93c5fd;outline-offset:-2px}${
          opts.selectedModuleId ? `[data-module-id="${escapeAttr(opts.selectedModuleId)}"]{outline:2px solid #2563eb;outline-offset:-2px}` : ""
        }</style>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.subject)}</title>
${previewStyle}
</head>
<body style="margin:0;padding:0;background-color:${pageBg};">
<table ${TABLE_ATTRS} width="100%" bgcolor="${pageBg}" style="width:100%;background-color:${pageBg};border-collapse:collapse;">
<tr><td align="center" style="padding:24px 0;">
<table ${TABLE_ATTRS} width="${CONTENT_WIDTH}" bgcolor="${contentBg}" style="width:${CONTENT_WIDTH}px;background-color:${contentBg};border-collapse:collapse;">
${rows}
</table>
</td></tr>
</table>
</body>
</html>
`;
}

export function renderEmailPlainText(doc: EmailDocument): string {
  const parts: string[] = [];
  for (const m of doc.modules) {
    const c = m.content as Record<string, unknown>;
    switch (m.type) {
      case "header":
        parts.push(String(c.wordmark ?? ""));
        break;
      case "hero": {
        const alt = (c.image as { alt?: string } | undefined)?.alt;
        if (alt) parts.push(`[${alt}]`);
        break;
      }
      case "text":
        if (c.headline) parts.push(String(c.headline).toUpperCase());
        parts.push(richTextToPlain(c.body as RichText));
        break;
      case "cta":
        parts.push(`${c.label}${c.url ? `: ${c.url}` : ""}`);
        break;
      case "footer":
        parts.push("--", richTextToPlain(c.body as RichText));
        break;
    }
  }
  return parts.filter((p) => p.trim()).join("\n\n") + "\n";
}

/** Lists every image source referenced by the document, in order. */
export function collectImageSources(doc: EmailDocument): ImageSource[] {
  const out: ImageSource[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if ("src" in o && "alt" in o && "width" in o && o.src && typeof o.src === "object") {
      out.push(o.src as ImageSource);
    }
    for (const child of Object.values(o)) if (child && typeof child === "object") visit(child);
  };
  for (const m of doc.modules) {
    visit(m.content);
    out.push(...(getModule(m.type)?.images?.(m.content, m.settings) ?? []));
  }
  return out;
}

export function imageSourceKey(src: ImageSource): string {
  return src.kind === "asset" ? `asset:${src.assetId}` : `sample:${src.sampleId}`;
}
