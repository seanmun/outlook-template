import { z } from "zod";
import { AlignSchema, ColorSchema, ImageValueSchema, OptionalUrlSchema, PaddingSchema, PlainTextSchema } from "../fields";
import { escapeHtml, safeColor, style } from "../html";
import { defineModule, type RenderContext } from "./types";
import { alignedBlock, imageHtml, moduleRow, TABLE_ATTRS } from "./shared";

const Content = z.object({
  logo: ImageValueSchema,
  /** Text wordmark shown when no logo image is set. */
  wordmark: PlainTextSchema(80),
  linkUrl: OptionalUrlSchema,
});
const Settings = z.object({
  align: AlignSchema,
  backgroundColor: ColorSchema,
  textColor: ColorSchema,
  wordmarkSize: z.number().int().min(14).max(36),
  padding: PaddingSchema,
});
type C = z.infer<typeof Content>;
type S = z.infer<typeof Settings>;

function logoOrWordmark(ctx: RenderContext<C, S>, available: number): string {
  const { content, settings, brand } = ctx;
  if (content.logo.src) {
    return alignedBlock(
      settings.align,
      imageHtml({
        image: { ...content.logo, linkUrl: content.linkUrl || undefined },
        src: ctx.resolveImage(content.logo.src),
        available,
        fontFamily: brand.fontFamily,
        placeholderLabel: "Logo image missing",
        attrs: ctx.imageAttrs("logo"),
      }),
    );
  }
  return `<div${ctx.fieldAttrs("wordmark")} style="${style({
    margin: "0",
    "font-family": brand.headingFontFamily,
    "font-size": settings.wordmarkSize,
    "line-height": Math.round(settings.wordmarkSize * 1.2),
    "font-weight": "bold",
    color: safeColor(settings.textColor),
    "text-align": settings.align,
    "mso-line-height-rule": "exactly",
  })}">${escapeHtml(content.wordmark || brand.wordmark)}</div>`;
}

function renderDefault(ctx: RenderContext<C, S>): string {
  const { settings } = ctx;
  const available = ctx.contentWidth - settings.padding.left - settings.padding.right;
  return moduleRow({
    rowAttrs: ctx.rowAttrs,
    background: settings.backgroundColor,
    padding: settings.padding,
    align: settings.align,
    inner: logoOrWordmark(ctx, available),
  });
}

/** Copperfield: same content, different layout (accent bar above the logo row). */
function renderCopperfield(ctx: RenderContext<C, S>): string {
  const { settings, brand } = ctx;
  const available = ctx.contentWidth - settings.padding.left - settings.padding.right;
  const bg = safeColor(settings.backgroundColor, "#ffffff");
  const accent = safeColor(brand.colors.primary);
  return `<tr${ctx.rowAttrs}><td style="padding:0;"><table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse;">` +
    `<tr><td height="6" bgcolor="${accent}" style="height:6px;line-height:6px;font-size:6px;background-color:${accent};">&nbsp;</td></tr>` +
    `<tr><td align="${settings.align}" bgcolor="${bg}" style="${style({
      padding: `${settings.padding.top}px ${settings.padding.right}px ${settings.padding.bottom}px ${settings.padding.left}px`,
      "background-color": bg,
      "text-align": settings.align,
    })}">${logoOrWordmark(ctx, available)}</td></tr></table></td></tr>`;
}

export const headerModule = defineModule<C, S>({
  type: "header",
  name: "Logo / header",
  description: "Brand logo image or text wordmark at the top of the email.",
  brands: "all",
  contentSchema: Content,
  settingsSchema: Settings,
  defaults: (brand) => ({
    content: {
      logo: { src: null, alt: brand.wordmark, width: 160, naturalWidth: null, naturalHeight: null },
      wordmark: brand.wordmark,
      linkUrl: "",
    },
    settings: {
      align: brand.id === "lumen-labs" ? "left" : "center",
      backgroundColor: brand.colors.contentBackground,
      textColor: brand.colors.heading,
      wordmarkSize: 22,
      padding: { top: 24, right: 32, bottom: 24, left: 32 },
    },
  }),
  contentFields: [
    { key: "logo", label: "Logo image", kind: "image", maxWidth: 300, help: "Leave empty to use the text wordmark." },
    { key: "wordmark", label: "Wordmark text", kind: "text", maxLength: 80, sizeSetting: "wordmarkSize", colorSetting: "textColor" },
    { key: "linkUrl", label: "Logo link", kind: "url", optional: true },
  ],
  settingFields: [
    { key: "align", label: "Alignment", kind: "align" },
    { key: "backgroundColor", label: "Background", kind: "color" },
    { key: "textColor", label: "Wordmark colour", kind: "color" },
    { key: "wordmarkSize", label: "Wordmark size", kind: "number", min: 14, max: 36, unit: "px" },
    { key: "padding", label: "Padding", kind: "padding" },
  ],
  // The link sits on the logo image; a text wordmark is not linked.
  activeLinks: (content) => (content.logo.src ? ["linkUrl"] : []),
  aiGuidance: "Usually the first module. Do not invent logo images; the wordmark defaults to the brand name.",
  render: renderDefault,
  renderers: { copperfield: renderCopperfield },
});
