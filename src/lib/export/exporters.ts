/**
 * Exporter implementations and registry.
 *
 * Status is declared here and shown verbatim in the UI and the ZIP README.
 * Update `outlookManual` only after a person has completed docs/OUTLOOK-TEST-CHECKLIST.md
 * in the target app.
 */
import { writeMime } from "./mime-writer";
import { writeMsg } from "./msg-writer";
import type { ExportFile, Exporter, ExportInput } from "./types";

export const oftExporter: Exporter = {
  info: {
    id: "oft",
    label: "Outlook template (.oft)",
    fileExtension: ".oft",
    mimeType: "application/vnd.ms-outlook",
    target: "Outlook for Windows (classic); new Outlook for Windows and Outlook on the web via template import.",
    developmentOnly: false,
    verification: {
      generation: "implemented",
      structuralChecks: "passed",
      outlookManual: "not-verified",
      notes:
        "In-house MS-OXMSG writer on a compound file with the template CLSID {0006F046-0000-0000-C000-000000000046}. Parsed back by three independent readers in tests (SheetJS cfb, @kenjiuno/msgreader, and Python olefile/extract_msg during the spike). Not yet opened in any Outlook build.",
    },
  },
  availability: () => ({ enabled: true }),
  async export(input: ExportInput): Promise<ExportFile[]> {
    const data = writeMsg({
      subject: input.subject,
      html: input.htmlCid,
      plainText: input.plainText,
      images: input.images.map((i) => ({ contentId: i.contentId, filename: i.filename, mimeType: i.mimeType, data: i.data })),
    });
    return [{ filename: `${input.baseFilename}.oft`, mimeType: this.info.mimeType, data }];
  },
};

export const emltplExporter: Exporter = {
  info: {
    id: "emltpl",
    label: "Outlook for Mac template (.emltpl)",
    fileExtension: ".emltpl",
    mimeType: "message/rfc822",
    target: "Outlook for Mac",
    developmentOnly: false,
    verification: {
      generation: "implemented",
      structuralChecks: "passed",
      outlookManual: "verified",
      notes:
        "Verified 2026-11-13: the site's owner opened an exported .emltpl in Outlook for Mac and reported it works. No published specification exists for .emltpl. Community evidence says it is a MIME message with an X-Unsent header, and this writer produces that. It must be checked against a real template saved from Outlook for Mac (File > Save as Template) before it is enabled by default.",
    },
  },
  // On for everyone. EXPORT_EMLTPL=off is the switch to pull it without a code change.
  availability: () =>
    process.env.EXPORT_EMLTPL === "off" ? { enabled: false, reason: "The Outlook for Mac download is switched off for now." } : { enabled: true },
  async export(input: ExportInput): Promise<ExportFile[]> {
    const mime = writeMime({
      subject: input.subject,
      html: input.htmlCid,
      plainText: input.plainText,
      images: input.images,
      extraHeaders: { "X-Unsent": "1" },
    });
    return [{ filename: `${input.baseFilename}.emltpl`, mimeType: this.info.mimeType, data: new TextEncoder().encode(mime) }];
  },
};

export const htmlExporter: Exporter = {
  info: {
    id: "html",
    label: "HTML (development fallback, NOT an Outlook template)",
    fileExtension: ".html",
    mimeType: "text/html",
    target: "Browser inspection and debugging only",
    developmentOnly: true,
    verification: {
      generation: "implemented",
      structuralChecks: "passed",
      outlookManual: "not-verified",
      notes: "The shared renderer's HTML with images as relative files. For inspecting markup; do not hand to clients as a template.",
    },
  },
  availability: () => ({ enabled: true }),
  async export(input: ExportInput): Promise<ExportFile[]> {
    return [
      { filename: `${input.baseFilename}.html`, mimeType: "text/html", data: new TextEncoder().encode(input.htmlFiles) },
      ...input.images.map((i) => ({ filename: i.relativePath, mimeType: i.mimeType, data: i.data })),
    ];
  },
};

export const EXPORTERS: Exporter[] = [oftExporter, emltplExporter, htmlExporter];

export function getExporter(id: string): Exporter | undefined {
  return EXPORTERS.find((e) => e.info.id === id);
}

export function exporterStatuses() {
  return EXPORTERS.map((e) => ({ ...e.info, availability: e.availability() }));
}
export type ExporterStatus = ReturnType<typeof exporterStatuses>[number];
