import { z } from "zod";
import { ColorSchema, PaddingSchema } from "../fields";
import { safeColor, style } from "../html";
import { defineModule } from "./types";
import { TABLE_ATTRS, paddingCss } from "./shared";

/** Column width ratios for each layout. */
export const COLUMN_LAYOUTS = {
  "1-1": { label: "Two equal columns", ratios: [1, 1] },
  "1-2": { label: "Narrow left, wide right (1/3 + 2/3)", ratios: [1, 2] },
  "2-1": { label: "Wide left, narrow right (2/3 + 1/3)", ratios: [2, 1] },
  "1-1-1": { label: "Three equal columns", ratios: [1, 1, 1] },
} as const;
export type ColumnLayout = keyof typeof COLUMN_LAYOUTS;
export const COLUMN_LAYOUT_IDS = Object.keys(COLUMN_LAYOUTS) as ColumnLayout[];

const Content = z.object({});
const Settings = z.object({
  layout: z.enum(["1-1", "1-2", "2-1", "1-1-1"]),
  backgroundColor: ColorSchema,
  valign: z.enum(["top", "middle", "bottom"]),
  gap: z.number().int().min(0).max(60),
  padding: PaddingSchema,
});
type C = z.infer<typeof Content>;
type S = z.infer<typeof Settings>;

/** Pixel width of each column: the row's inner width minus gaps, split by the layout's ratios. */
export function columnWidths(settings: { layout: ColumnLayout; gap: number; padding: { left: number; right: number } }, contentWidth: number): number[] {
  const ratios = COLUMN_LAYOUTS[settings.layout].ratios;
  const inner = Math.max(ratios.length * 40, contentWidth - settings.padding.left - settings.padding.right - settings.gap * (ratios.length - 1));
  const total = ratios.reduce((a, b) => a + b, 0);
  const widths = ratios.map((r) => Math.floor((inner * r) / total));
  widths[widths.length - 1] += inner - widths.reduce((a, b) => a + b, 0);
  return widths;
}

export const columnsModule = defineModule<C, S>({
  type: "columns",
  name: "Columns",
  description: "A row of two or three side-by-side columns. Each column holds its own stack of blocks.",
  brands: "all",
  contentSchema: Content,
  settingsSchema: Settings,
  defaults: (brand) => ({
    content: {},
    settings: { layout: "1-1", backgroundColor: brand.colors.contentBackground, valign: "top", gap: 24, padding: { top: 16, right: 40, bottom: 16, left: 40 } },
  }),
  contentFields: [],
  settingFields: [
    { key: "layout", label: "Layout", kind: "select", options: COLUMN_LAYOUT_IDS.map((id) => ({ value: id, label: COLUMN_LAYOUTS[id].label })) },
    { key: "backgroundColor", label: "Background", kind: "color" },
    {
      key: "valign",
      label: "Vertical alignment",
      kind: "select",
      options: [
        { value: "top", label: "Top" },
        { value: "middle", label: "Middle" },
        { value: "bottom", label: "Bottom" },
      ],
    },
    { key: "gap", label: "Space between columns", kind: "number", min: 0, max: 60, unit: "px" },
    { key: "padding", label: "Padding", kind: "padding" },
  ],
  aiGuidance:
    'A container, not content. Add it with settings {"layout": ...}, give it a ref, then add blocks into it with add_module using parentId (its ref or id) and column (0 = leftmost). Blocks inside a column should use small or zero left/right padding. Columns never stack on phones, so use them only when the design is genuinely side by side.',
  render: (ctx) => {
    const s = ctx.settings;
    const bg = safeColor(s.backgroundColor, "#ffffff");
    const widths = columnWidths(s, ctx.contentWidth);
    // Fixed-width cells in a nested table: the layout Outlook's Word engine renders most reliably.
    const cells = widths
      .map((w, i) => {
        const gapCell = i > 0 && s.gap > 0 ? `<td width="${s.gap}" style="${style({ width: `${s.gap}px`, "font-size": 0, "line-height": 0 })}">&nbsp;</td>` : "";
        return `${gapCell}<td width="${w}" valign="${s.valign}" style="${style({ width: `${w}px`, "vertical-align": s.valign })}"><table ${TABLE_ATTRS} width="${w}" style="${style({ width: `${w}px`, "border-collapse": "collapse" })}">${
          ctx.renderColumn(i, w) || `<tr><td style="font-size:0;line-height:0;">&nbsp;</td></tr>`
        }</table></td>`;
      })
      .join("");
    return `<tr${ctx.rowAttrs}><td bgcolor="${bg}" style="${style({ padding: paddingCss(s.padding), "background-color": bg })}"><table ${TABLE_ATTRS} style="border-collapse:collapse;"><tr>${cells}</tr></table></td></tr>`;
  },
});
