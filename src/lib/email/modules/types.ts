import type { z } from "zod";
import type { Brand } from "../brands";
import type { ContentFieldSpec, ImageSource, SettingFieldSpec } from "../fields";

export interface RenderContext<C, S> {
  brand: Brand;
  content: C;
  settings: S;
  /** Attributes for the module's outer <tr> (preview annotations; empty on export). */
  rowAttrs: string;
  /** Returns the URL to place in an <img src>, or null when unresolved. */
  resolveImage: (src: ImageSource) => string | null;
  contentWidth: number;
  /** For a columns row: the rendered rows of one column's blocks at the given width. Empty string otherwise. */
  renderColumn: (column: number, width: number) => string;
  /** Attributes marking the element that shows a plain-text field, so the preview can edit it in place (empty on export). */
  fieldAttrs: (key: string) => string;
  /** Wraps rendered rich text so the preview can edit it in place. Returns the html unchanged on export. */
  editable: (key: string, html: string) => string;
  /** Attributes marking the element that shows an image field, so the preview can replace it in place (empty on export). */
  imageAttrs: (key: string) => string;
  /** Attributes marking an element whose link is the url field `key`, so the preview can edit that link (empty on export). */
  linkAttrs: (key: string) => string;
  /** Attributes for a column cell (preview annotations; empty on export). */
  columnAttrs: (column: number) => string;
}

export type ModuleRenderer<C, S> = (ctx: RenderContext<C, S>) => string;

export interface ModuleDefinition<C = Record<string, unknown>, S = Record<string, unknown>> {
  type: string;
  name: string;
  description: string;
  /** "all", or the brand IDs allowed to use this module. */
  brands: "all" | string[];
  contentSchema: z.ZodType<C>;
  settingsSchema: z.ZodType<S>;
  defaults: (brand: Brand) => { content: C; settings: S };
  contentFields: ContentFieldSpec[];
  settingFields: SettingFieldSpec[];
  /** Extra guidance for the AI about how to use this module. */
  aiGuidance?: string;
  /** The url fields currently in use, when not all of them are (e.g. only the social icons being shown). Default: all. */
  activeLinks?: (content: C) => string[];
  /** Images the module renders that are not image fields (e.g. built-in icons), so exports can embed them. */
  images?: (content: C, settings: S) => ImageSource[];
  /** Default renderer, shared by brands with identical structure. */
  render: ModuleRenderer<C, S>;
  /** Brand-specific renderers for layouts that differ. */
  renderers?: Record<string, ModuleRenderer<C, S>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModuleDefinition = ModuleDefinition<any, any>;

export function defineModule<C, S>(def: ModuleDefinition<C, S>): ModuleDefinition<C, S> {
  return def;
}
