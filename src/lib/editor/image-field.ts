/** Placing images into image fields: shared by the canvas and the side panel. */
import { locateModule, type EmailDocument } from "@/lib/email/document";
import type { ImageSource, ImageValue } from "@/lib/email/fields";
import { columnWidths } from "@/lib/email/modules/columns";
import { CONTENT_WIDTH } from "@/lib/email/render";

/** The widest an image inside this module can be: the email (or its column) minus the module's side padding. */
export function moduleInnerWidth(doc: EmailDocument, moduleId: string): number {
  const at = locateModule(doc, moduleId);
  const row = at && at.parentId !== null ? doc.modules.find((m) => m.id === at.parentId) : undefined;
  const available = row && at && at.parentId !== null ? columnWidths(row.settings as Parameters<typeof columnWidths>[0], CONTENT_WIDTH)[at.column] : CONTENT_WIDTH;
  const m = at && (at.parentId === null ? doc.modules[at.index] : row?.columns?.[at.column].blocks[at.index]);
  const p = m?.settings.padding as { left: number; right: number } | undefined;
  return Math.max(16, available - (p ? p.left + p.right : 0));
}

/** Puts a new picture into an image field, keeping its alt text and link. An empty field takes the full width allowed. */
export function placeImage(current: ImageValue, picture: { src: ImageSource; width: number; height: number }, maxWidth: number): ImageValue {
  const width = Math.min(maxWidth, picture.width, current.src ? current.width : maxWidth);
  return { ...current, src: picture.src, naturalWidth: picture.width, naturalHeight: picture.height, width: Math.max(16, width) };
}

/** True when the picture has fewer than twice the pixels of its display width, so it may look soft on sharp screens. */
export function isLowRes(image: ImageValue): boolean {
  return !!image.src && !!image.naturalWidth && image.naturalWidth < image.width * 2;
}
