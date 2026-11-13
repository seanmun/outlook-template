import { z } from "zod";
import { AlignSchema, ColorSchema, OptionalUrlSchema, PaddingSchema, PlainTextSchema } from "../fields";
import { escapeAttr, escapeHtml, safeColor, sanitizeUrl, style } from "../html";
import { defineModule } from "./types";
import { alignedBlock, moduleRow, TABLE_ATTRS } from "./shared";

/** The largest corner rounding offered, in px. */
export const MAX_BUTTON_RADIUS = 30;

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
  /** Corner rounding in px; 0 is square. Emails made before this setting existed have none, so it defaults to square. */
  radius: z.number().int().min(0).max(MAX_BUTTON_RADIUS).default(0),
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
      radius: brand.buttonRadius,
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
    {
      key: "radius",
      label: "Rounded corners",
      kind: "number",
      min: 0,
      max: MAX_BUTTON_RADIUS,
      unit: "px",
      help: "0 is square. In the Windows download a rounded button is saved as a picture, because classic Outlook cannot round a button any other way. It looks right, but its wording can only be changed here, not inside Outlook.",
    },
    { key: "padding", label: "Padding", kind: "padding" },
  ],
  aiGuidance: "Leave url as an empty string unless the user supplied the exact final URL. Never invent URLs. radius rounds the corners (0 is square); set it only when the user or the comp asks for rounded buttons.",
  render: (ctx) => {
    const { settings: s, content, brand } = ctx;
    const href = sanitizeUrl(content.url) ?? "#";
    const bg = safeColor(s.buttonColor);
    const label = content.label || "Button";
    const radius = s.radius ?? 0;
    // Classic Outlook for Windows rounds nothing drawn with code (CSS or VML; tested 2026-11-13), so
    // the Windows template shows a picture of the rounded button instead. The picture is drawn in the
    // sender's browser at download time; without one the button falls back to code, square in classic Outlook.
    const picture = radius > 0 ? ctx.buttonPicture : null;
    const button = picture
      ? `<a href="${escapeAttr(href)}" target="_blank" style="text-decoration:none;"><img src="${escapeAttr(picture.src)}" width="${picture.width}" height="${picture.height}" alt="${escapeAttr(label)}" border="0" style="${style({
          display: "block",
          border: "0",
          width: picture.width,
          height: picture.height,
          "font-family": brand.fontFamily,
          "font-size": s.fontSize,
          "font-weight": "bold",
          color: safeColor(s.buttonColor),
        })}"></a>`
      : // Padding sits on the <td> (honoured by Outlook's Word engine); the link is text-sized.
        `<table ${TABLE_ATTRS} style="border-collapse:separate;"><tr><td align="center" bgcolor="${bg}" style="${style({
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
        })}">${escapeHtml(label)}</a></td></tr></table>`;
    return moduleRow({
      rowAttrs: ctx.rowAttrs,
      background: s.backgroundColor,
      padding: s.padding,
      align: s.align,
      inner: alignedBlock(s.align, button),
    });
  },
});
