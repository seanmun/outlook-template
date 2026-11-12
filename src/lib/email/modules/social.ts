import { z } from "zod";
import { AlignSchema, ColorSchema, OptionalUrlSchema, PaddingSchema, PlainTextSchema, type ImageSource } from "../fields";
import { escapeAttr, sanitizeUrl, style } from "../html";
import { defineModule } from "./types";
import { alignedBlock, moduleRow, TABLE_ATTRS } from "./shared";

export const SOCIAL_NETWORKS = [
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
] as const;
type NetworkId = (typeof SOCIAL_NETWORKS)[number]["id"];

const Content = z.object({
  /** Which icons to show, in order, e.g. "facebook, x, instagram". */
  networks: PlainTextSchema(80),
  facebookUrl: OptionalUrlSchema,
  xUrl: OptionalUrlSchema,
  instagramUrl: OptionalUrlSchema,
  linkedinUrl: OptionalUrlSchema,
  youtubeUrl: OptionalUrlSchema,
  tiktokUrl: OptionalUrlSchema,
});
const Settings = z.object({
  align: AlignSchema,
  backgroundColor: ColorSchema,
  iconTone: z.enum(["dark", "light"]),
  iconSize: z.number().int().min(16).max(48),
  gap: z.number().int().min(4).max(40),
  padding: PaddingSchema,
});
type C = z.infer<typeof Content>;
type S = z.infer<typeof Settings>;

/** Parses the free-text list, keeping known networks in the order given, without repeats. */
export function selectedNetworks(list: string): NetworkId[] {
  const known = new Map<string, NetworkId>(SOCIAL_NETWORKS.map((n) => [n.id, n.id]));
  known.set("twitter", "x");
  const out: NetworkId[] = [];
  for (const raw of list.toLowerCase().split(/[\s,;]+/)) {
    const id = known.get(raw);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

const iconSource = (id: NetworkId, tone: S["iconTone"]): ImageSource => ({ kind: "sample", sampleId: `social-${id}-${tone}` });

export const socialModule = defineModule<C, S>({
  type: "social",
  name: "Social icons",
  description: "A row of small social network icons, each linking to a profile.",
  brands: "all",
  contentSchema: Content,
  settingsSchema: Settings,
  defaults: (brand) => ({
    content: { networks: "facebook, x, instagram", facebookUrl: "", xUrl: "", instagramUrl: "", linkedinUrl: "", youtubeUrl: "", tiktokUrl: "" },
    settings: {
      align: "center",
      backgroundColor: brand.colors.contentBackground,
      iconTone: "dark",
      iconSize: 24,
      gap: 20,
      padding: { top: 16, right: 40, bottom: 24, left: 40 },
    },
  }),
  contentFields: [
    { key: "networks", label: "Icons to show", kind: "text", maxLength: 80, help: `In order, separated by commas. Options: ${SOCIAL_NETWORKS.map((n) => n.id).join(", ")}.` },
    ...SOCIAL_NETWORKS.map((n) => ({ key: `${n.id}Url`, label: `${n.label} link`, kind: "url" as const, help: "Used only if that icon is shown." })),
  ],
  settingFields: [
    { key: "align", label: "Alignment", kind: "align" },
    { key: "backgroundColor", label: "Background", kind: "color" },
    {
      key: "iconTone",
      label: "Icon colour",
      kind: "select",
      options: [
        { value: "dark", label: "Dark (for light backgrounds)" },
        { value: "light", label: "White (for dark backgrounds)" },
      ],
    },
    { key: "iconSize", label: "Icon size", kind: "number", min: 16, max: 48, unit: "px" },
    { key: "gap", label: "Space between icons", kind: "number", min: 4, max: 40, unit: "px" },
    { key: "padding", label: "Padding", kind: "padding" },
  ],
  aiGuidance:
    'Set networks to the icons wanted, in order (e.g. "facebook, x, instagram"); only the listed options exist. Leave each link as "" unless the user supplied the exact profile URL. Use iconTone "light" on dark backgrounds.',
  activeLinks: (content) => selectedNetworks(content.networks).map((id) => `${id}Url`),
  images: (content, settings) => selectedNetworks(content.networks).map((id) => iconSource(id, settings.iconTone)),
  render: (ctx) => {
    const { content, settings: s } = ctx;
    const ids = selectedNetworks(content.networks);
    const cells = ids
      .map((id, i) => {
        const label = SOCIAL_NETWORKS.find((n) => n.id === id)!.label;
        const src = ctx.resolveImage(iconSource(id, s.iconTone));
        const img = src
          ? `<img src="${escapeAttr(src)}" width="${s.iconSize}" height="${s.iconSize}" alt="${escapeAttr(label)}" style="${style({ display: "block", width: `${s.iconSize}px`, height: `${s.iconSize}px`, border: "0" })}">`
          : escapeAttr(label);
        const href = sanitizeUrl(content[`${id}Url`]);
        const linked = href ? `<a href="${escapeAttr(href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img;
        return `<td${ctx.linkAttrs(`${id}Url`)} style="${style({ padding: `0 ${i === ids.length - 1 ? 0 : s.gap}px 0 0` })}">${linked}</td>`;
      })
      .join("");
    const row = cells ? `<table ${TABLE_ATTRS} style="border-collapse:collapse;"><tr>${cells}</tr></table>` : "";
    return moduleRow({ rowAttrs: ctx.rowAttrs, background: s.backgroundColor, padding: s.padding, align: s.align, inner: alignedBlock(s.align, row) });
  },
});
