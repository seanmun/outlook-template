import { requireBrand } from "@/lib/email/brands";
import { allModules, type EmailDocument } from "@/lib/email/document";

/** What the download request carries for one rounded button: a PNG and the size it takes in the email. */
export interface ButtonPictureUpload {
  png: string;
  width: number;
  height: number;
}

interface ButtonSettings {
  radius?: number;
  backgroundColor: string;
  buttonColor: string;
  buttonTextColor: string;
  fontSize: number;
  buttonPaddingY: number;
  buttonPaddingX: number;
}

/** Drawn at twice the size it is shown, so it stays sharp on high-resolution screens. */
const SCALE = 2;
const MAX_WIDTH = 600;

/** Blocks whose button is rounded, and so needs a picture in the Windows template. */
export function roundedButtons(doc: EmailDocument) {
  return allModules(doc).filter((m) => m.type === "cta" && Number((m.settings as { radius?: number }).radius) > 0);
}

/**
 * Draws each rounded button as a picture, for the Windows template: classic Outlook cannot round a
 * button any other way. The picture matches the code-drawn button: same font, sizes and colours,
 * with the block's own background behind the corners so it needs no transparency.
 */
export function buttonPicturesForExport(doc: EmailDocument): Record<string, ButtonPictureUpload> {
  const out: Record<string, ButtonPictureUpload> = {};
  const brand = requireBrand(doc.brandId);
  for (const m of roundedButtons(doc)) {
    const s = m.settings as unknown as ButtonSettings;
    const label = String((m.content as { label?: string }).label || "Button");
    const font = `bold ${s.fontSize}px ${brand.fontFamily}`;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.font = font;
    const lineHeight = Math.round(s.fontSize * 1.3);
    const width = Math.min(MAX_WIDTH, Math.ceil(ctx.measureText(label).width) + s.buttonPaddingX * 2);
    const height = lineHeight + s.buttonPaddingY * 2;
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = s.backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = s.buttonColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, Math.min(Number(s.radius), height / 2, width / 2));
    ctx.fill();
    // Sizing the canvas resets its state, so the font is set again before drawing.
    ctx.font = font;
    ctx.fillStyle = s.buttonTextColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    // Centre on the height of a capital letter, which is how the eye reads a button label.
    const capHeight = ctx.measureText("H").actualBoundingBoxAscent;
    ctx.fillText(label, width / 2, height / 2 + capHeight / 2, width - 8);
    out[m.id] = { png: canvas.toDataURL("image/png").split(",")[1], width, height };
  }
  return out;
}
