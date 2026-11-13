/**
 * Document -> exporter input -> ZIP package. Pure apart from the injected image loader,
 * so it runs identically in route handlers, scripts and tests.
 */
import JSZip from "jszip";
import { requireBrand } from "@/lib/email/brands";
import { allModules, type EmailDocument } from "@/lib/email/document";
import type { ImageSource } from "@/lib/email/fields";
import { findContentIssues, type ContentIssue } from "@/lib/email/issues";
import { assertValidDocument } from "@/lib/email/registry";
import { collectImageSources, imageSourceKey, renderEmailHtml, renderEmailPlainText } from "@/lib/email/render";
import { getExporter } from "./exporters";
import { ExportFailedError, ExporterUnavailableError, type ExportFile, type ExportImage, type ExportInput, type ExporterId } from "./types";

export interface LoadedImage {
  data: Uint8Array;
}

/** Loads image bytes for export. Must enforce the caller's authorization. */
export type ImageLoader = (src: ImageSource) => Promise<LoadedImage | null>;

export class MissingImageError extends Error {
  constructor(public key: string) {
    super(`Image ${key} could not be loaded for export (missing, or not owned by this user).`);
    this.name = "MissingImageError";
  }
}

export function sniffImageType(data: Uint8Array): ExportImage["mimeType"] | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "image/gif";
  return null;
}

const EXT: Record<ExportImage["mimeType"], string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };

export function slugify(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "email"
  );
}

/** A picture of one rounded button, drawn in the sender's browser. Width and height are its size in the email, in px. */
export interface ButtonPictureInput {
  data: Uint8Array;
  width: number;
  height: number;
}

export const MAX_BUTTON_PICTURE_BYTES = 300 * 1024;

/** Keeps only pictures that belong to a rounded button in this email and are sane PNGs of a plausible size. */
function usableButtonPictures(doc: EmailDocument, pictures: Record<string, ButtonPictureInput> | undefined): Map<string, ButtonPictureInput> {
  const out = new Map<string, ButtonPictureInput>();
  if (!pictures) return out;
  for (const m of allModules(doc)) {
    const p = pictures[m.id];
    if (!p || m.type !== "cta" || !(Number((m.settings as { radius?: number }).radius) > 0)) continue;
    const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
    if (!whole(p.width, 16, 600) || !whole(p.height, 12, 200)) continue;
    if (p.data.length > MAX_BUTTON_PICTURE_BYTES || sniffImageType(p.data) !== "image/png") continue;
    out.set(m.id, p);
  }
  return out;
}

export async function prepareExportInput(rawDoc: EmailDocument, loadImage: ImageLoader, buttonPictures?: Record<string, ButtonPictureInput>): Promise<ExportInput> {
  const doc = assertValidDocument(rawDoc);
  requireBrand(doc.brandId);

  const images = new Map<string, ExportImage>();
  let n = 0;
  for (const src of collectImageSources(doc)) {
    const key = imageSourceKey(src);
    if (images.has(key)) continue;
    const loaded = await loadImage(src);
    if (!loaded) throw new MissingImageError(key);
    const mimeType = sniffImageType(loaded.data);
    if (!mimeType) throw new Error(`Image ${key} is not a PNG, JPEG or GIF.`);
    n++;
    const filename = `image-${n}.${EXT[mimeType]}`;
    images.set(key, {
      contentId: `img${n}.${Date.now().toString(36)}@outlook-template`,
      filename,
      mimeType,
      data: loaded.data,
      relativePath: `images/${filename}`,
    });
  }

  const htmlCid = renderEmailHtml(doc, { resolveImage: (src) => `cid:${images.get(imageSourceKey(src))!.contentId}` });
  const htmlFiles = renderEmailHtml(doc, { resolveImage: (src) => images.get(imageSourceKey(src))!.relativePath });

  // The Windows template gets its own body when there are rounded buttons with pictures to show.
  const pictures = usableButtonPictures(doc, buttonPictures);
  let windows: ExportInput["windows"];
  if (pictures.size > 0) {
    const stamp = Date.now().toString(36);
    const byModule = new Map<string, { image: ExportImage; width: number; height: number }>();
    let b = 0;
    for (const [moduleId, p] of pictures) {
      b++;
      const filename = `button-${b}.png`;
      byModule.set(moduleId, { image: { contentId: `btn${b}.${stamp}@outlook-template`, filename, mimeType: "image/png", data: p.data, relativePath: `images/${filename}` }, width: p.width, height: p.height });
    }
    windows = {
      htmlCid: renderEmailHtml(doc, {
        resolveImage: (src) => `cid:${images.get(imageSourceKey(src))!.contentId}`,
        buttonPicture: (moduleId) => {
          const hit = byModule.get(moduleId);
          return hit ? { src: `cid:${hit.image.contentId}`, width: hit.width, height: hit.height } : null;
        },
      }),
      images: [...images.values(), ...[...byModule.values()].map((v) => v.image)],
    };
  }
  return {
    windows,
    subject: doc.subject,
    htmlCid,
    htmlFiles,
    plainText: renderEmailPlainText(doc),
    images: [...images.values()],
    baseFilename: slugify(doc.title || doc.subject),
  };
}

export interface ExportPackageResult {
  zip: Uint8Array;
  filename: string;
  included: ExporterId[];
  issues: ContentIssue[];
}

function readme(doc: EmailDocument, included: ExporterId[], issues: ContentIssue[]): string {
  const lines = [
    `${doc.title || "Email"}: Outlook template package`,
    "=".repeat(60),
    "",
    `Subject: ${doc.subject}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "FILES",
  ];
  for (const id of included) {
    const e = getExporter(id)!;
    lines.push(`- *${e.info.fileExtension}  ${e.info.label}`, `    Target: ${e.info.target}`);
  }
  lines.push(
    "",
    "HOW TO USE",
    "Outlook for Windows (classic):",
    "  Double-click the .oft file, or Home > New Items > More Items > Choose Form >",
    "  Look in: User Templates in File System > Browse to the .oft. Edit, add recipients, send.",
    "New Outlook for Windows / Outlook on the web:",
    "  Microsoft added .oft import to the Templates feature (roadmap RM485757, GA Oct 2025).",
    "  Import the .oft into your templates, then insert it into a new message.",
    "  Exact menu location varies by build; confirm in your tenant.",
  );
  if (included.includes("emltpl")) {
    lines.push("Outlook for Mac:", "  Double-click the .emltpl file (or File > Open), edit, add recipients, send.");
  }
  lines.push(
    "",
    "VERIFICATION STATUS (read before sending to a large audience)",
  );
  for (const id of included) {
    const v = getExporter(id)!.info.verification;
    lines.push(
      `- ${id}: generation=${v.generation}, structural checks=${v.structuralChecks}, Outlook manual verification=${v.outlookManual}`,
    );
  }
  lines.push(
    "  Always send yourself a test message first. Rendering is not guaranteed to match the",
    "  browser preview, especially in Outlook for Windows (Word rendering engine).",
  );
  if (included.includes("html")) {
    lines.push("", "The .html file is a DEVELOPMENT FALLBACK for inspecting markup. It is not an Outlook template.");
  }
  if (issues.length) {
    lines.push("", "UNRESOLVED ITEMS AT EXPORT TIME");
    for (const i of issues) lines.push(`- ${i.message}`);
  }
  return lines.join("\r\n") + "\r\n";
}

export async function buildExportPackage(opts: {
  doc: EmailDocument;
  formats: ExporterId[];
  loadImage: ImageLoader;
  /** Pictures of the email's rounded buttons, by block id, for the Windows template. */
  buttonPictures?: Record<string, ButtonPictureInput>;
}): Promise<ExportPackageResult> {
  if (opts.formats.length === 0) throw new Error("Choose at least one export format.");
  const exporters = opts.formats.map((id) => {
    const e = getExporter(id);
    if (!e) throw new ExporterUnavailableError(id, "unknown exporter");
    const a = e.availability();
    if (!a.enabled) throw new ExporterUnavailableError(id, a.reason ?? "disabled");
    return e;
  });

  const input = await prepareExportInput(opts.doc, opts.loadImage, opts.buttonPictures);
  const zip = new JSZip();
  for (const e of exporters) {
    let files: ExportFile[];
    try {
      files = await e.export(input);
    } catch (err) {
      throw new ExportFailedError(e.info.id, err);
    }
    for (const f of files) zip.file(e.info.developmentOnly ? `development-html/${f.filename}` : f.filename, f.data);
  }
  const issues = findContentIssues(opts.doc);
  zip.file("README.txt", readme(opts.doc, opts.formats, issues));
  const data = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { zip: data, filename: `${input.baseFilename}.zip`, included: opts.formats, issues };
}
