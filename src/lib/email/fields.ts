/** Reusable Zod primitives and inspector field specs for module definitions. */
import { z } from "zod";
import { isSafeUrl } from "./html";

export const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be #rrggbb");
export const AlignSchema = z.enum(["left", "center", "right"]);
export type Align = z.infer<typeof AlignSchema>;

const pad = z.number().int().min(0).max(120);
export const PaddingSchema = z.object({ top: pad, right: pad, bottom: pad, left: pad });
export type Padding = z.infer<typeof PaddingSchema>;

/** Empty string is allowed and surfaced as an unresolved placeholder; anything else must be safe. */
export const OptionalUrlSchema = z
  .string()
  .max(2048)
  .refine((v) => v === "" || isSafeUrl(v), "Link must be an absolute https, http or mailto URL");

export const PlainTextSchema = (max: number) =>
  z
    .string()
    .max(max)
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v), "Text contains control characters");

export const ImageSourceSchema = z.discriminatedUnion("kind", [
  /** Uploaded asset owned by the user (Supabase Storage, or local in demo mode). */
  z.object({ kind: z.literal("asset"), assetId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/) }),
  /** Built-in fictional sample image bundled with the app. */
  z.object({ kind: z.literal("sample"), sampleId: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/) }),
]);
export type ImageSource = z.infer<typeof ImageSourceSchema>;

export const ImageValueSchema = z.object({
  src: ImageSourceSchema.nullable(),
  alt: PlainTextSchema(300),
  /** Display width in px. Height is derived from the intrinsic aspect ratio. */
  width: z.number().int().min(16).max(600),
  naturalWidth: z.number().int().min(1).max(10000).nullable(),
  naturalHeight: z.number().int().min(1).max(10000).nullable(),
  linkUrl: OptionalUrlSchema.optional(),
});
export type ImageValue = z.infer<typeof ImageValueSchema>;

export function imageDisplayHeight(img: ImageValue, width: number, fallbackRatio = 0.5): number {
  if (img.naturalWidth && img.naturalHeight) return Math.max(1, Math.round((width * img.naturalHeight) / img.naturalWidth));
  return Math.round(width * fallbackRatio);
}

/* ---------- Inspector field specs (what the UI and the AI may edit) ---------- */

/** Which of the module's settings hold this text's size and colour, so on-canvas text tools can change them. */
export interface TextStyleSettings {
  sizeSetting?: string;
  colorSetting?: string;
}

export type ContentFieldSpec =
  | ({ key: string; label: string; kind: "text"; maxLength: number; multiline?: boolean; help?: string } & TextStyleSettings)
  | ({ key: string; label: string; kind: "richtext"; help?: string } & TextStyleSettings)
  | { key: string; label: string; kind: "url"; help?: string; /** Fine to leave empty; not flagged as missing. */ optional?: boolean }
  | { key: string; label: string; kind: "image"; maxWidth: number; allowLink?: boolean; help?: string };

export type SettingFieldSpec =
  | { key: string; label: string; kind: "color" }
  | { key: string; label: string; kind: "align" }
  | { key: string; label: string; kind: "padding" }
  | { key: string; label: string; kind: "number"; min: number; max: number; step?: number; unit?: string; help?: string }
  | { key: string; label: string; kind: "select"; options: { value: number | string; label: string }[] };
