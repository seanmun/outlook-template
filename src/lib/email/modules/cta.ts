import { z } from "zod";
import { AlignSchema, ColorSchema, OptionalUrlSchema, PaddingSchema, PlainTextSchema } from "../fields";
import { escapeAttr, escapeHtml, safeColor, sanitizeUrl, style } from "../html";
import { defineModule } from "./types";
import { alignedBlock, moduleRow, TABLE_ATTRS } from "./shared";

const Content = z.object({
  label: PlainTextSchema(80),
  url: OptionalUrlSchema,
});
const Settings = z.object({
  align: AlignSchema,
  backgroundColor: ColorSchema,
  buttonColor: ColorSchema,
  buttonTextColor: ColorSchema,
  fontSize: z.number().int().min(12).max(22),
  buttonPaddingY: z.number().int().min(4).max(32),
  buttonPaddingX: z.number().int().min(8).max(64),
  padding: PaddingSchema,
});
type C = z.infer<typeof Content>;
type S = z.infer<typeof Settings>;

export const ctaModule = defineModule<C, S>({
  type: "cta",
  name: "CTA button",
  description: "A single call-to-action button linking to a URL.",
  brands: "all",
  contentSchema: Content,
  settingsSchema: Settings,
  defaults: (brand) => ({
    content: { label: "Learn more", url: "" },
    settings: {
      align: brand.id === "harbor-pine" ? "center" : "left",
      backgroundColor: brand.colors.contentBackground,
      buttonColor: brand.colors.primary,
      buttonTextColor: brand.colors.primaryText,
      fontSize: 15,
      buttonPaddingY: 12,
      buttonPaddingX: 28,
      padding: { top: 8, right: 40, bottom: 32, left: 40 },
    },
  }),
  contentFields: [
    { key: "label", label: "Button label", kind: "text", maxLength: 80, sizeSetting: "fontSize", colorSetting: "buttonTextColor" },
    { key: "url", label: "Button link", kind: "url", help: "Absolute https:// or mailto: link." },
  ],
  settingFields: [
    { key: "align", label: "Alignment", kind: "align" },
    { key: "backgroundColor", label: "Background", kind: "color" },
    { key: "buttonColor", label: "Button colour", kind: "color" },
    { key: "buttonTextColor", label: "Button text colour", kind: "color" },
    { key: "fontSize", label: "Label size", kind: "number", min: 12, max: 22, unit: "px" },
    { key: "buttonPaddingY", label: "Button vertical padding", kind: "number", min: 4, max: 32, unit: "px" },
    { key: "buttonPaddingX", label: "Button horizontal padding", kind: "number", min: 8, max: 64, unit: "px" },
    { key: "padding", label: "Padding", kind: "padding" },
  ],
  aiGuidance: "Leave url as an empty string unless the user supplied the exact final URL. Never invent URLs.",
  render: (ctx) => {
    const { settings: s, content, brand } = ctx;
    const href = sanitizeUrl(content.url) ?? "#";
    const bg = safeColor(s.buttonColor);
    // Padding sits on the <td> (honoured by Outlook's Word engine); the link is text-sized.
    // Square by default (brand.buttonRadius is 0): no rounding method is verified for .oft yet; intentionally no VML.
    const radius = brand.buttonRadius;
    const button = `<table ${TABLE_ATTRS} style="border-collapse:separate;"><tr><td align="center" bgcolor="${bg}" style="${style({
      padding: `${s.buttonPaddingY}px ${s.buttonPaddingX}px`,
      "background-color": bg,
      "border-radius": radius ? `${radius}px` : null,
    })}"><a${ctx.fieldAttrs("label")} href="${escapeAttr(href)}" target="_blank" style="${style({
      "font-family": brand.fontFamily,
      "font-size": s.fontSize,
      "line-height": Math.round(s.fontSize * 1.3),
      "font-weight": "bold",
      color: safeColor(s.buttonTextColor),
      "text-decoration": "none",
      display: "inline-block",
      "mso-line-height-rule": "exactly",
    })}">${escapeHtml(content.label || "Button")}</a></td></tr></table>`;
    return moduleRow({
      rowAttrs: ctx.rowAttrs,
      background: s.backgroundColor,
      padding: s.padding,
      align: s.align,
      inner: alignedBlock(s.align, button),
    });
  },
});
