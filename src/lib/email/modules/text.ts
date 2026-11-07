import { z } from "zod";
import { AlignSchema, ColorSchema, PaddingSchema, PlainTextSchema } from "../fields";
import { escapeHtml, safeColor, style } from "../html";
import { plainParagraphs, renderRichText, RichTextSchema } from "../richtext";
import { defineModule } from "./types";
import { moduleRow } from "./shared";

const Content = z.object({
  headline: PlainTextSchema(200),
  body: RichTextSchema,
});
const Settings = z.object({
  align: AlignSchema,
  backgroundColor: ColorSchema,
  headlineColor: ColorSchema,
  textColor: ColorSchema,
  linkColor: ColorSchema,
  headlineSize: z.number().int().min(16).max(40),
  bodySize: z.number().int().min(12).max(20),
  headlineGap: z.number().int().min(0).max(48),
  paragraphGap: z.number().int().min(0).max(40),
  padding: PaddingSchema,
});
type C = z.infer<typeof Content>;
type S = z.infer<typeof Settings>;

export const textModule = defineModule<C, S>({
  type: "text",
  name: "Headline & body",
  description: "Optional headline followed by rich body copy (bold, italic, links, bullets).",
  brands: "all",
  contentSchema: Content,
  settingsSchema: Settings,
  defaults: (brand) => ({
    content: {
      headline: "Headline",
      body: plainParagraphs("Body copy goes here."),
    },
    settings: {
      align: brand.id === "harbor-pine" ? "center" : "left",
      backgroundColor: brand.colors.contentBackground,
      headlineColor: brand.colors.heading,
      textColor: brand.colors.text,
      linkColor: brand.colors.link,
      headlineSize: brand.headlineSizes[1] ?? 24,
      bodySize: 15,
      headlineGap: 12,
      paragraphGap: 14,
      padding: { top: 28, right: 40, bottom: 28, left: 40 },
    },
  }),
  contentFields: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 200, help: "Leave empty to hide the headline." },
    { key: "body", label: "Body", kind: "richtext" },
  ],
  settingFields: [
    { key: "align", label: "Alignment", kind: "align" },
    { key: "backgroundColor", label: "Background", kind: "color" },
    { key: "headlineColor", label: "Headline colour", kind: "color" },
    { key: "textColor", label: "Body colour", kind: "color" },
    { key: "linkColor", label: "Link colour", kind: "color" },
    { key: "headlineSize", label: "Headline size", kind: "number", min: 16, max: 40, unit: "px" },
    { key: "bodySize", label: "Body size", kind: "number", min: 12, max: 20, unit: "px" },
    { key: "headlineGap", label: "Headline to body spacing", kind: "number", min: 0, max: 48, unit: "px" },
    { key: "paragraphGap", label: "Paragraph spacing", kind: "number", min: 0, max: 40, unit: "px" },
    { key: "padding", label: "Padding", kind: "padding" },
  ],
  aiGuidance: "Use for intros, announcements and details. Keep each body to a few short paragraphs.",
  render: (ctx) => {
    const { settings: s, content, brand } = ctx;
    const hasBody = content.body.content.length > 0;
    const headline = content.headline.trim()
      ? `<h1 style="${style({
          margin: `0 0 ${hasBody ? s.headlineGap : 0}px 0`,
          padding: "0",
          "font-family": brand.headingFontFamily,
          "font-size": s.headlineSize,
          "line-height": Math.round(s.headlineSize * 1.25),
          "font-weight": "bold",
          color: safeColor(s.headlineColor),
          "text-align": s.align,
          "mso-line-height-rule": "exactly",
        })}">${escapeHtml(content.headline)}</h1>`
      : "";
    const body = hasBody
      ? renderRichText(content.body, {
          fontFamily: brand.fontFamily,
          fontSize: s.bodySize,
          lineHeight: Math.round(s.bodySize * 1.55),
          color: safeColor(s.textColor),
          linkColor: safeColor(s.linkColor),
          paragraphGap: s.paragraphGap,
          align: s.align,
        })
      : "";
    return moduleRow({
      rowAttrs: ctx.rowAttrs,
      background: s.backgroundColor,
      padding: s.padding,
      align: s.align,
      inner: headline + body || "&nbsp;",
    });
  },
});
