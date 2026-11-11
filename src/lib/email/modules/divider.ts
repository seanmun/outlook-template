import { z } from "zod";
import { AlignSchema, ColorSchema, PaddingSchema } from "../fields";
import { safeColor, style } from "../html";
import { defineModule } from "./types";
import { alignedBlock, clampWidth, moduleRow, TABLE_ATTRS } from "./shared";

const Content = z.object({});
const Settings = z.object({
  align: AlignSchema,
  backgroundColor: ColorSchema,
  lineColor: ColorSchema,
  thickness: z.number().int().min(1).max(8),
  width: z.number().int().min(40).max(600),
  padding: PaddingSchema,
});
type C = z.infer<typeof Content>;
type S = z.infer<typeof Settings>;

export const dividerModule = defineModule<C, S>({
  type: "divider",
  name: "Divider",
  description: "A thin horizontal rule that separates sections.",
  brands: "all",
  contentSchema: Content,
  settingsSchema: Settings,
  defaults: (brand) => ({
    content: {},
    settings: {
      align: "center",
      backgroundColor: brand.colors.contentBackground,
      lineColor: "#d9dde2",
      thickness: 1,
      width: 520,
      padding: { top: 16, right: 40, bottom: 16, left: 40 },
    },
  }),
  contentFields: [],
  settingFields: [
    { key: "align", label: "Alignment", kind: "align" },
    { key: "backgroundColor", label: "Background", kind: "color" },
    { key: "lineColor", label: "Line colour", kind: "color" },
    { key: "thickness", label: "Thickness", kind: "number", min: 1, max: 8, unit: "px" },
    { key: "width", label: "Width", kind: "number", min: 40, max: 600, unit: "px", help: "Limited by module padding." },
    { key: "padding", label: "Padding", kind: "padding" },
  ],
  render: (ctx) => {
    const s = ctx.settings;
    const width = clampWidth(s.width, ctx.contentWidth - s.padding.left - s.padding.right);
    const color = safeColor(s.lineColor);
    // A coloured table cell, not <hr> or a border: Outlook's Word engine renders both of those inconsistently.
    const line = `<table ${TABLE_ATTRS} width="${width}" style="${style({ width: `${width}px`, "border-collapse": "collapse" })}"><tr><td width="${width}" height="${s.thickness}" bgcolor="${color}" style="${style({
      width: `${width}px`,
      height: `${s.thickness}px`,
      "background-color": color,
      "font-size": 0,
      "line-height": 0,
      "mso-line-height-rule": "exactly",
    })}">&nbsp;</td></tr></table>`;
    return moduleRow({ rowAttrs: ctx.rowAttrs, background: s.backgroundColor, padding: s.padding, align: s.align, inner: alignedBlock(s.align, line) });
  },
});
