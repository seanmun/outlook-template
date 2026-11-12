import { z } from "zod";
import { AlignSchema, ColorSchema, ImageValueSchema, PaddingSchema } from "../fields";
import { defineModule } from "./types";
import { alignedBlock, imageHtml, moduleRow } from "./shared";

const Content = z.object({ image: ImageValueSchema });
const Settings = z.object({
  align: AlignSchema,
  backgroundColor: ColorSchema,
  padding: PaddingSchema,
});
type C = z.infer<typeof Content>;
type S = z.infer<typeof Settings>;

export const heroModule = defineModule<C, S>({
  type: "hero",
  name: "Hero image",
  description: "A single wide image with alt text and optional link.",
  brands: "all",
  contentSchema: Content,
  settingsSchema: Settings,
  defaults: (brand) => ({
    content: {
      image: { src: null, alt: "", width: 600, naturalWidth: null, naturalHeight: null, linkUrl: "" },
    },
    settings: {
      align: "center",
      backgroundColor: brand.colors.contentBackground,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  }),
  contentFields: [{ key: "image", label: "Image", kind: "image", maxWidth: 600, allowLink: true }],
  settingFields: [
    { key: "align", label: "Alignment", kind: "align" },
    { key: "backgroundColor", label: "Background", kind: "color" },
    { key: "padding", label: "Padding", kind: "padding" },
  ],
  aiGuidance:
    "The AI cannot supply images. New hero modules start with an empty image placeholder the user must fill. You may set alt text describing the intended image.",
  render: (ctx) => {
    const { settings, content, brand } = ctx;
    const available = ctx.contentWidth - settings.padding.left - settings.padding.right;
    return moduleRow({
      rowAttrs: ctx.rowAttrs,
      background: settings.backgroundColor,
      padding: settings.padding,
      align: settings.align,
      inner: alignedBlock(
        settings.align,
        imageHtml({
          image: content.image,
          src: content.image.src ? ctx.resolveImage(content.image.src) : null,
          available,
          fontFamily: brand.fontFamily,
          // The canvas invites a click; an exported email with a missing image says what it is.
          placeholderLabel: ctx.imageAttrs("image") ? "Click to add an image, or drop one here" : "Image placeholder: upload an image",
          attrs: ctx.imageAttrs("image"),
        }),
      ),
    });
  },
});
