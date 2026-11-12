/**
 * The one renderer used by both the live preview and every exporter.
 *
 * Compatibility constraints (see docs/EMAIL-HTML.md): the <head> is treated as
 * disposable, so nothing essential lives there. Table layout, inline styles,
 * explicit image dimensions, no classes/media queries/scripts/web fonts/flex/grid.
 */
import { requireBrand } from "./brands";
import { allModules, type EmailDocument, type ModuleInstance } from "./document";
import { escapeAttr, escapeHtml, safeColor } from "./html";
import type { ImageSource } from "./fields";
import type { Brand } from "./brands";
import { getModule, rendererFor } from "./registry";
import { richTextToPlain, type RichText } from "./richtext";
import { TABLE_ATTRS } from "./modules/shared";

export const CONTENT_WIDTH = 600;

/**
 * Outlook for Windows only (other clients see a comment): pin rendering to 96 pixels per inch
 * so images keep their stated size on high-resolution screens, and allow PNGs.
 * Nothing in the layout depends on it; the <head> is still disposable.
 */
const OFFICE_SETTINGS = "<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->";

export interface RenderOptions {
  resolveImage: (src: ImageSource) => string | null;
  /** Adds data-module-id attributes so the preview can map clicks to modules. Never set for export. */
  annotate?: boolean;
  /** Preview only: these modules play a "drop into place" animation on this render, one after another. */
  animateModuleIds?: string[];
}

/**
 * Hover and selection marks for the canvas. Preview only; never exported.
 * Selected: four corner brackets snap inward and lock onto the module, like a target reticle,
 * over a faint frame that breathes. Hover: quieter brackets on the innermost module under the pointer.
 */
const corners = (color: string, len: number, w: number) =>
  ["top left", "top right", "bottom left", "bottom right"].flatMap((pos) => [`linear-gradient(${color},${color}) ${pos}/${len}px ${w}px no-repeat`, `linear-gradient(${color},${color}) ${pos}/${w}px ${len}px no-repeat`]).join(",");
const SELECTION_STYLE = [
  "[data-module-id]>td{position:relative}",
  `[data-module-id]>td::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:2;opacity:0}`,
  `[data-module-id]:hover:not(:has([data-module-id]:hover)):not([data-selected])>td::after{opacity:1;background:${corners("#7dd3fc", 12, 2)};box-shadow:inset 0 0 0 1px rgba(125,211,252,.35)}`,
  `[data-module-id][data-selected]>td::after{opacity:1;background:${corners("#2563eb", 20, 3)};animation:otb-lock .32s cubic-bezier(.2,1.5,.4,1) both,otb-breathe 2.6s ease-in-out .32s infinite}`,
  "@keyframes otb-lock{0%{inset:-14px;opacity:0;filter:brightness(2.2) saturate(1.4)}60%{opacity:1}100%{inset:0;opacity:1;filter:none}}",
  "@keyframes otb-breathe{0%,100%{box-shadow:inset 0 0 0 1px rgba(37,99,235,.35),0 0 0 0 rgba(37,99,235,0)}50%{box-shadow:inset 0 0 0 1px rgba(37,99,235,.6),0 0 16px 1px rgba(56,189,248,.45)}}",
  "@media (prefers-reduced-motion:reduce){[data-module-id]>td::after{animation:none!important}}",
].join("");

/** A short overshoot-and-settle, with a highlight flash that fades. Preview only; never exported. */
const DROP_KEYFRAMES =
  "@keyframes otb-drop{0%{opacity:0;transform:translateY(-22px) scale(1.04);box-shadow:0 0 0 3px #2563eb,0 18px 40px rgba(37,99,235,.35)}55%{opacity:1;transform:translateY(3px) scale(.995);box-shadow:0 0 0 3px #2563eb,0 4px 10px rgba(37,99,235,.25)}100%{opacity:1;transform:none;box-shadow:0 0 0 0 rgba(37,99,235,0)}}@media (prefers-reduced-motion:reduce){[data-module-id]>td{animation:none!important}}";

function renderModules(modules: ModuleInstance[], brand: Brand, opts: RenderOptions, contentWidth: number): string {
  return modules
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
        contentWidth,
        renderColumn: (column, width) => renderModules(m.columns?.[column]?.blocks ?? [], brand, opts, width),
        columnAttrs: (column) => (opts.annotate ? ` data-column="${column}"` : ""),
        imageAttrs: (key) => (opts.annotate ? ` data-image-field="${escapeAttr(key)}"` : ""),
        linkAttrs: (key) => (opts.annotate ? ` data-link="${escapeAttr(key)}"` : ""),
        fieldAttrs: (key) => (opts.annotate ? ` data-field="${escapeAttr(key)}" data-field-kind="text"` : ""),
        editable: (key, html) => (opts.annotate ? `<div data-field="${escapeAttr(key)}" data-field-kind="richtext">${html}</div>` : html),
      });
    })
    .join("\n");
}

/** Expects a document that already passed validateDocument(). */
export function renderEmailHtml(doc: EmailDocument, opts: RenderOptions): string {
  const brand = requireBrand(doc.brandId);
  const pageBg = safeColor(brand.colors.pageBackground);
  const contentBg = safeColor(brand.colors.contentBackground);

  const rows = renderModules(doc.modules, brand, opts, CONTENT_WIDTH);

  const previewStyle =
    opts.annotate
      ? `<style>${DROP_KEYFRAMES}${(opts.animateModuleIds ?? [])
          .map((id, i) => `[data-module-id="${escapeAttr(id)}"]>td{animation:otb-drop .42s cubic-bezier(.2,1.4,.4,1) ${Math.min(i, 12) * 70}ms both;position:relative}`)
          .join("")}body{-webkit-user-select:none;user-select:none}[data-module-id]{cursor:grab}${SELECTION_STYLE}[data-field]{-webkit-user-select:text;user-select:text;cursor:text;outline:none;min-width:8px}[data-image-field]{cursor:pointer}[data-link]{cursor:pointer}[data-field]:focus{box-shadow:0 0 0 1px rgba(37,99,235,.55),0 0 0 4px rgba(37,99,235,.14);border-radius:2px}</style>`
      : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.subject)}</title>
${OFFICE_SETTINGS}
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
  for (const m of allModules(doc)) {
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
  for (const m of allModules(doc)) {
    visit(m.content);
    out.push(...(getModule(m.type)?.images?.(m.content, m.settings) ?? []));
  }
  return out;
}

export function imageSourceKey(src: ImageSource): string {
  return src.kind === "asset" ? `asset:${src.assetId}` : `sample:${src.sampleId}`;
}
