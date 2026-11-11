import { z } from "zod";
import { AlignSchema, ColorSchema, PaddingSchema } from "../fields";
import { safeColor } from "../html";
import { plainParagraphs, renderRichText, RichTextSchema } from "../richtext";
import { defineModule } from "./types";
import { moduleRow } from "./shared";

const Content = z.object({ body: RichTextSchema });
const Settings = z.object({
  align: AlignSchema,
  backgroundColor: ColorSchema,
  textColor: ColorSchema,
  linkColor: ColorSchema,
  fontSize: z.number().int().min(10).max(16),
  paragraphGap: z.number().int().min(0).max(24),
  padding: PaddingSchema,
});
type C = z.infer<typeof Content>;
type S = z.infer<typeof Settings>;

export const footerModule = defineModule<C, S>({
  type: "footer",
  name: "Footer",
  description: "Small print: sender team, contact line, internal distribution note.",
  brands: "all",
  contentSchema: Content,
  settingsSchema: Settings,
  defaults: (brand) => ({
    content: {
      body: plainParagraphs(
        `${brand.wordmark} · Internal communication`,
        "[[PLACEHOLDER: sender team and contact details]]",
      ),
    },
    settings: {
      align: "center",
      backgroundColor: brand.colors.footerBackground,
      textColor: brand.colors.footerText,
      linkColor: brand.colors.footerText,
      fontSize: 12,
      paragraphGap: 8,
      padding: { top: 24, right: 40, bottom: 24, left: 40 },
    },
  }),
  contentFields: [{ key: "body", label: "Footer text", kind: "richtext", sizeSetting: "fontSize", colorSetting: "textColor" }],
  settingFields: [
    { key: "align", label: "Alignment", kind: "align" },
    { key: "backgroundColor", label: "Background", kind: "color" },
    { key: "textColor", label: "Text colour", kind: "color" },
    { key: "linkColor", label: "Link colour", kind: "color" },
    { key: "fontSize", label: "Text size", kind: "number", min: 10, max: 16, unit: "px" },
    { key: "paragraphGap", label: "Paragraph spacing", kind: "number", min: 0, max: 24, unit: "px" },
    { key: "padding", label: "Padding", kind: "padding" },
  ],
  aiGuidance: "Usually the last module. Use [[PLACEHOLDER: ...]] for contact details you were not given.",
  render: (ctx) => {
    const { settings: s, content, brand } = ctx;
    return moduleRow({
      rowAttrs: ctx.rowAttrs,
      background: s.backgroundColor,
      padding: s.padding,
      align: s.align,
      inner:
        content.body.content.length > 0
          ? ctx.editable("body", renderRichText(content.body, {
              fontFamily: brand.fontFamily,
              fontSize: s.fontSize,
              lineHeight: Math.round(s.fontSize * 1.5),
              color: safeColor(s.textColor),
              linkColor: safeColor(s.linkColor),
              paragraphGap: s.paragraphGap,
              align: s.align,
            }))
          : "&nbsp;",
    });
  },
});
